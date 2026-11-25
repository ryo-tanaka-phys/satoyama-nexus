import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import {
  defaultGrantsForRoleTrack,
  resolveGridCellCoordinates,
  resolveVenueServerAuthContext,
  toPublicVenueProfile,
  validateVenueTags,
  type Actor,
  type CorporateSponsorRecord,
  type CorporateSupportPlanRecord,
  type DemoAccountRecord,
  type DemoSessionRecord,
  type PublicVenueProfileView,
  type ServerAuthContext,
  type VenueProfileRecord,
  type VenueRoleTrack,
  type VenueTag
} from '../packages/domain/src';
import { applyMigrations, loadMigrationFiles } from './migrator';
import {
  DEFAULT_SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken
} from '../apps/web/lib/venue-session';
import {
  buildKyushuVenueSeed,
  type SeedDummyMembership,
  type SeedSocialPost
} from '../apps/web/lib/venue-seed';

export interface RegisterVenueAccountInput {
  displayName: string;
  roleTrack: VenueRoleTrack;
  gridCellId: string;
  postalCode?: string | null;
  interestTags: readonly string[];
  strengthTags: readonly string[];
  bio?: string;
  ageInternal?: number | null;
  genderInternal?: string | null;
  seekingMatch?: boolean;
  mode?: 'standard' | 'werewolf';
  werewolfRoomId?: string | null;
}

export interface ResolvedVenueSession {
  authenticated: boolean;
  session: DemoSessionRecord | null;
  account: DemoAccountRecord | null;
  profile: VenueProfileRecord | null;
  authContext: ServerAuthContext;
}

export interface VenueFoundationSnapshot {
  actors: readonly Actor[];
  publicProfiles: readonly PublicVenueProfileView[];
  demoAccounts: readonly DemoAccountRecord[];
  corporateSponsors: readonly CorporateSponsorRecord[];
  corporatePlans: readonly CorporateSupportPlanRecord[];
  memberships: readonly SeedDummyMembership[];
  initialPosts: readonly SeedSocialPost[];
}

export interface VenueFoundationStorePort {
  ensureSeeded(): Promise<void>;
  getFoundationSnapshot(): Promise<VenueFoundationSnapshot>;
  registerAccountAndCreateSession(
    input: RegisterVenueAccountInput,
    nowIso?: string
  ): Promise<{ rawToken: string; account: DemoAccountRecord; profile: VenueProfileRecord; session: DemoSessionRecord }>;
  createSessionForAccount(
    accountId: string,
    options?: { mode?: 'standard' | 'werewolf'; werewolfRoomId?: string | null; nowIso?: string }
  ): Promise<{ rawToken: string; session: DemoSessionRecord; account: DemoAccountRecord }>;
  resolveSessionByToken(rawToken: string | null | undefined, nowIso?: string): Promise<ResolvedVenueSession>;
  revokeSessionByToken(rawToken: string | null | undefined, nowIso?: string): Promise<void>;
}

function actorKindForRoleTrack(roleTrack: VenueRoleTrack): Actor['kind'] {
  switch (roleTrack) {
    case 'organization':
      return 'organization';
    case 'government':
      return 'government-body';
    case 'citizen':
    case 'operator':
    default:
      return 'person';
  }
}

function resolveMigrationsDir(): string {
  const candidates = [
    resolve(process.cwd(), 'db/migrations'),
    resolve(process.cwd(), '../../db/migrations')
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(`Could not locate db/migrations from cwd=${process.cwd()}`);
}

/**
 * In-memory P1 foundation store for local dev / Vercel without DATABASE_URL and fast unit tests.
 */
export class InMemoryVenueFoundationStore implements VenueFoundationStorePort {
  private seeded = false;
  private actors: Actor[] = [];
  private profiles = new Map<string, VenueProfileRecord>();
  private accounts = new Map<string, DemoAccountRecord>();
  private sessions = new Map<string, DemoSessionRecord>();
  private memberships: SeedDummyMembership[] = [];
  private corporateSponsors: CorporateSponsorRecord[] = [];
  private corporatePlans: CorporateSupportPlanRecord[] = [];
  private initialPosts: SeedSocialPost[] = [];
  private seq = 1;

  async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    const seed = buildKyushuVenueSeed();
    this.actors = seed.actors.map((a) => ({ ...a, expertise: a.expertise.map((e) => ({ ...e })) }));
    this.profiles = new Map(seed.venueProfiles.map((p) => [p.actorId, structuredClone(p)]));
    this.accounts = new Map(seed.demoAccounts.map((a) => [a.id, structuredClone(a)]));
    this.memberships = seed.memberships.map((m) => ({ ...m }));
    this.corporateSponsors = seed.corporateSponsors.map((s) => ({ ...s }));
    this.corporatePlans = seed.corporatePlans.map((p) => ({ ...p, requiredTags: [...p.requiredTags] }));
    this.initialPosts = seed.initialPosts.map((p) => ({ ...p, tags: [...p.tags] }));
    this.seeded = true;
  }

  async getFoundationSnapshot(): Promise<VenueFoundationSnapshot> {
    await this.ensureSeeded();
    return {
      actors: structuredClone(this.actors),
      publicProfiles: [...this.profiles.values()].map(toPublicVenueProfile),
      demoAccounts: structuredClone([...this.accounts.values()]),
      corporateSponsors: structuredClone(this.corporateSponsors),
      corporatePlans: structuredClone(this.corporatePlans),
      memberships: structuredClone(this.memberships),
      initialPosts: structuredClone(this.initialPosts)
    };
  }

  async registerAccountAndCreateSession(
    input: RegisterVenueAccountInput,
    nowIso = new Date().toISOString()
  ): Promise<{ rawToken: string; account: DemoAccountRecord; profile: VenueProfileRecord; session: DemoSessionRecord }> {
    await this.ensureSeeded();
    const displayName = input.displayName.trim();
    if (!displayName) throw new Error('Display name is required');

    // Validate grid cell coordinates and strict 9-tag allowlist
    resolveGridCellCoordinates(input.gridCellId);
    const interestTags: VenueTag[] = validateVenueTags(input.interestTags);
    const strengthTags: VenueTag[] = validateVenueTags(input.strengthTags);

    const suffix = `${Date.now().toString(36)}-${this.seq++}`;
    const actorId = `sim-user-${suffix}`;
    const accountId = `demo-acct-${suffix}`;

    const actor: Actor = {
      id: actorId,
      domain: 'simulation',
      kind: actorKindForRoleTrack(input.roleTrack),
      displayName,
      expertise: strengthTags.map((label) => ({ label, evidence: null }))
    };

    const profile: VenueProfileRecord = {
      actorId,
      gridCellId: input.gridCellId,
      postalCode: input.postalCode?.trim() || null,
      interestTags,
      strengthTags,
      bio: input.bio?.trim() ?? '',
      ageInternal: typeof input.ageInternal === 'number' && Number.isFinite(input.ageInternal) ? Math.trunc(input.ageInternal) : null,
      genderInternal: input.genderInternal?.trim() || null,
      seekingMatch: Boolean(input.seekingMatch),
      orgCertificationStatus: 'none',
      expertCertified: false,
      expertCertificationNote: null,
      updatedAt: nowIso
    };

    const account: DemoAccountRecord = {
      id: accountId,
      displayName,
      roleTrack: input.roleTrack,
      actorId,
      operatedActorIds: [actorId],
      grants: defaultGrantsForRoleTrack(input.roleTrack),
      createdAt: nowIso,
      revokedAt: null
    };

    this.actors.push(actor);
    this.profiles.set(actorId, profile);
    this.accounts.set(accountId, account);

    const { rawToken, session } = await this.createSessionForAccount(accountId, {
      mode: input.mode ?? 'standard',
      werewolfRoomId: input.werewolfRoomId ?? null,
      nowIso
    });

    return {
      rawToken,
      account: structuredClone(account),
      profile: structuredClone(profile),
      session: structuredClone(session)
    };
  }

  async createSessionForAccount(
    accountId: string,
    options?: { mode?: 'standard' | 'werewolf'; werewolfRoomId?: string | null; nowIso?: string }
  ): Promise<{ rawToken: string; session: DemoSessionRecord; account: DemoAccountRecord }> {
    await this.ensureSeeded();
    const account = this.accounts.get(accountId);
    if (!account || account.revokedAt !== null) {
      throw new Error(`Demo account not found or revoked: ${accountId}`);
    }
    const nowIso = options?.nowIso ?? new Date().toISOString();
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.parse(nowIso) + DEFAULT_SESSION_TTL_MS).toISOString();

    const session: DemoSessionRecord = {
      tokenHash,
      accountId: account.id,
      mode: options?.mode ?? 'standard',
      werewolfRoomId: options?.werewolfRoomId ?? null,
      createdAt: nowIso,
      expiresAt,
      revokedAt: null
    };
    this.sessions.set(tokenHash, session);
    return { rawToken, session: structuredClone(session), account: structuredClone(account) };
  }

  async resolveSessionByToken(
    rawToken: string | null | undefined,
    nowIso = new Date().toISOString()
  ): Promise<ResolvedVenueSession> {
    await this.ensureSeeded();
    if (!rawToken || !rawToken.trim()) {
      return { authenticated: false, session: null, account: null, profile: null, authContext: { authenticated: false } };
    }
    const tokenHash = hashSessionToken(rawToken.trim());
    const session = this.sessions.get(tokenHash) ?? null;
    const account = session ? this.accounts.get(session.accountId) ?? null : null;
    const authContext = resolveVenueServerAuthContext(session, account, nowIso);
    if (!authContext.authenticated || !session || !account) {
      return { authenticated: false, session: null, account: null, profile: null, authContext: { authenticated: false } };
    }
    const profile = this.profiles.get(account.actorId) ?? null;
    return {
      authenticated: true,
      session: structuredClone(session),
      account: structuredClone(account),
      profile: profile ? structuredClone(profile) : null,
      authContext
    };
  }

  async revokeSessionByToken(
    rawToken: string | null | undefined,
    nowIso = new Date().toISOString()
  ): Promise<void> {
    await this.ensureSeeded();
    if (!rawToken || !rawToken.trim()) return;
    const tokenHash = hashSessionToken(rawToken.trim());
    const existing = this.sessions.get(tokenHash);
    if (existing) {
      existing.revokedAt = nowIso;
    }
  }
}

/**
 * PostgreSQL/PostGIS-backed P1 foundation store.
 * Applies migrations 0001..0005 idempotently and seeds the Kyushu University simulated community.
 */
export class PgVenueFoundationStore implements VenueFoundationStorePort {
  private seeded = false;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    if (!this.initPromise) {
      this.initPromise = this.runInitialization().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    await this.initPromise;
  }

  private async runInitialization(): Promise<void> {
    const migrations = await loadMigrationFiles(resolveMigrationsDir());
    const client = await this.pool.connect();
    try {
      await applyMigrations(client, migrations);
    } finally {
      client.release();
    }

    const seed = buildKyushuVenueSeed();
    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      for (const actor of seed.actors) {
        await tx.query(
          `INSERT INTO simulation.actor (id, kind, display_name, expertise)
           VALUES ($1,$2,$3,$4::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [actor.id, actor.kind, actor.displayName, JSON.stringify(actor.expertise)]
        );
      }

      for (const profile of seed.venueProfiles) {
        const coords = seed.actorCoordinatesById[profile.actorId];
        if (coords) {
          await tx.query(
            `INSERT INTO simulation.actor_profile (actor_id, base_coordinates, available_transport_modes, willingness, note)
             VALUES ($1, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, '["徒歩","自転車","地域バス"]'::jsonb, $4, $5)
             ON CONFLICT (actor_id) DO NOTHING`,
            [
              profile.actorId,
              coords.longitude,
              coords.latitude,
              profile.seekingMatch ? 'explicit-interest' : 'open',
              '九州大学周辺固定グリッド基準（模擬）'
            ]
          );
        } else {
          await tx.query(
            `INSERT INTO simulation.actor_profile (actor_id, base_coordinates, available_transport_modes, willingness, note)
             VALUES ($1, NULL, '[]'::jsonb, $2, NULL)
             ON CONFLICT (actor_id) DO NOTHING`,
            [profile.actorId, profile.seekingMatch ? 'explicit-interest' : 'open']
          );
        }

        await tx.query(
          `INSERT INTO simulation.venue_profile
             (actor_id, grid_cell_id, postal_code, interest_tags, strength_tags, bio, age_internal, gender_internal,
              seeking_match, org_certification_status, expert_certified, expert_certification_note, updated_at)
           VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz)
           ON CONFLICT (actor_id) DO NOTHING`,
          [
            profile.actorId,
            profile.gridCellId,
            profile.postalCode,
            JSON.stringify(profile.interestTags),
            JSON.stringify(profile.strengthTags),
            profile.bio,
            profile.ageInternal,
            profile.genderInternal,
            profile.seekingMatch,
            profile.orgCertificationStatus,
            profile.expertCertified,
            profile.expertCertificationNote,
            profile.updatedAt
          ]
        );
      }

      for (const account of seed.demoAccounts) {
        await tx.query(
          `INSERT INTO simulation.demo_account
             (id, display_name, role_track, actor_id, operated_actor_ids, grants, created_at, revoked_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::timestamptz,$8::timestamptz)
           ON CONFLICT (id) DO NOTHING`,
          [
            account.id,
            account.displayName,
            account.roleTrack,
            account.actorId,
            JSON.stringify(account.operatedActorIds),
            JSON.stringify(account.grants),
            account.createdAt,
            account.revokedAt
          ]
        );
      }

      for (const m of seed.memberships) {
        await tx.query(
          `INSERT INTO simulation.actor_membership
             (person_actor_id, organization_actor_id, role, is_dummy, certified_by_account_id, certified_at)
           VALUES ($1,$2,$3,$4,$5,$6::timestamptz)
           ON CONFLICT (person_actor_id, organization_actor_id) DO NOTHING`,
          [m.personActorId, m.organizationActorId, m.role, m.isDummy, m.certifiedByAccountId, m.certifiedAt]
        );
      }

      for (const sponsor of seed.corporateSponsors) {
        await tx.query(
          `INSERT INTO simulation.corporate_sponsor (id, name, industry, summary)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (id) DO NOTHING`,
          [sponsor.id, sponsor.name, sponsor.industry, sponsor.summary]
        );
      }

      for (const plan of seed.corporatePlans) {
        await tx.query(
          `INSERT INTO simulation.corporate_support_plan
             (id, sponsor_id, title, support_type, summary, required_tags, requires_certified_org, requires_activity_report, requires_expert_advice)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
           ON CONFLICT (id) DO NOTHING`,
          [
            plan.id,
            plan.sponsorId,
            plan.title,
            plan.supportType,
            plan.summary,
            JSON.stringify(plan.requiredTags),
            plan.requiresCertifiedOrg,
            plan.requiresActivityReport,
            plan.requiresExpertAdvice
          ]
        );
      }

      for (const post of seed.initialPosts) {
        await tx.query(
          `INSERT INTO simulation.social_post
             (id, author_actor_id, channel, title, body, tags, grid_cell_id, endorsement_count, created_at)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::timestamptz)
           ON CONFLICT (id) DO NOTHING`,
          [
            post.id,
            post.authorActorId,
            post.channel,
            post.title,
            post.body,
            JSON.stringify(post.tags),
            post.gridCellId,
            post.endorsementCount,
            post.createdAt
          ]
        );
      }

      await tx.query('COMMIT');
    } catch (err) {
      await tx.query('ROLLBACK');
      throw err;
    } finally {
      tx.release();
    }

    this.seeded = true;
  }

  async getFoundationSnapshot(): Promise<VenueFoundationSnapshot> {
    await this.ensureSeeded();
    const [actorRes, profileRes, accountRes, sponsorRes, planRes, memRes, postRes] = await Promise.all([
      this.pool.query<{ id: string; kind: Actor['kind']; display_name: string; expertise: Actor['expertise'] }>(
        'SELECT id, kind, display_name, expertise FROM simulation.actor ORDER BY id ASC'
      ),
      this.pool.query<{
        actor_id: string;
        grid_cell_id: string | null;
        postal_code: string | null;
        interest_tags: VenueTag[];
        strength_tags: VenueTag[];
        bio: string;
        age_internal: number | null;
        gender_internal: string | null;
        seeking_match: boolean;
        org_certification_status: VenueProfileRecord['orgCertificationStatus'];
        expert_certified: boolean;
        expert_certification_note: string | null;
        updated_at: string;
      }>('SELECT actor_id, grid_cell_id, postal_code, interest_tags, strength_tags, bio, age_internal, gender_internal, seeking_match, org_certification_status, expert_certified, expert_certification_note, updated_at::text FROM simulation.venue_profile ORDER BY actor_id ASC'),
      this.pool.query<{
        id: string;
        display_name: string;
        role_track: VenueRoleTrack;
        actor_id: string;
        operated_actor_ids: string[];
        grants: DemoAccountRecord['grants'];
        created_at: string;
        revoked_at: string | null;
      }>('SELECT id, display_name, role_track, actor_id, operated_actor_ids, grants, created_at::text, revoked_at::text FROM simulation.demo_account ORDER BY created_at ASC'),
      this.pool.query<{ id: string; name: string; industry: string; summary: string }>(
        'SELECT id, name, industry, summary FROM simulation.corporate_sponsor ORDER BY id ASC'
      ),
      this.pool.query<{
        id: string;
        sponsor_id: string;
        title: string;
        support_type: CorporateSupportPlanRecord['supportType'];
        summary: string;
        required_tags: VenueTag[];
        requires_certified_org: boolean;
        requires_activity_report: boolean;
        requires_expert_advice: boolean;
      }>('SELECT id, sponsor_id, title, support_type, summary, required_tags, requires_certified_org, requires_activity_report, requires_expert_advice FROM simulation.corporate_support_plan ORDER BY id ASC'),
      this.pool.query<{
        person_actor_id: string;
        organization_actor_id: string;
        role: 'leader' | 'member';
        is_dummy: boolean;
        certified_by_account_id: string | null;
        certified_at: string | null;
      }>('SELECT person_actor_id, organization_actor_id, role, is_dummy, certified_by_account_id, certified_at::text FROM simulation.actor_membership'),
      this.pool.query<{
        id: string;
        author_actor_id: string;
        channel: SeedSocialPost['channel'];
        title: string;
        body: string;
        tags: VenueTag[];
        grid_cell_id: string;
        endorsement_count: number;
        created_at: string;
      }>('SELECT id, author_actor_id, channel, title, body, tags, grid_cell_id, endorsement_count, created_at::text FROM simulation.social_post ORDER BY created_at DESC')
    ]);

    const fullProfiles: VenueProfileRecord[] = profileRes.rows.map((r) => ({
      actorId: r.actor_id,
      gridCellId: r.grid_cell_id,
      postalCode: r.postal_code,
      interestTags: r.interest_tags,
      strengthTags: r.strength_tags,
      bio: r.bio,
      ageInternal: r.age_internal,
      genderInternal: r.gender_internal,
      seekingMatch: r.seeking_match,
      orgCertificationStatus: r.org_certification_status,
      expertCertified: r.expert_certified,
      expertCertificationNote: r.expert_certification_note,
      updatedAt: r.updated_at
    }));

    return {
      actors: actorRes.rows.map((r) => ({
        id: r.id,
        domain: 'simulation',
        kind: r.kind,
        displayName: r.display_name,
        expertise: r.expertise
      })),
      publicProfiles: fullProfiles.map(toPublicVenueProfile),
      demoAccounts: accountRes.rows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        roleTrack: r.role_track,
        actorId: r.actor_id,
        operatedActorIds: r.operated_actor_ids,
        grants: r.grants,
        createdAt: r.created_at,
        revokedAt: r.revoked_at
      })),
      corporateSponsors: sponsorRes.rows,
      corporatePlans: planRes.rows.map((r) => ({
        id: r.id,
        sponsorId: r.sponsor_id,
        title: r.title,
        supportType: r.support_type,
        summary: r.summary,
        requiredTags: r.required_tags,
        requiresCertifiedOrg: r.requires_certified_org,
        requiresActivityReport: r.requires_activity_report,
        requiresExpertAdvice: r.requires_expert_advice
      })),
      memberships: memRes.rows.map((r) => ({
        personActorId: r.person_actor_id,
        organizationActorId: r.organization_actor_id,
        role: r.role,
        isDummy: r.is_dummy,
        certifiedByAccountId: r.certified_by_account_id,
        certifiedAt: r.certified_at
      })),
      initialPosts: postRes.rows.map((r) => ({
        id: r.id,
        authorActorId: r.author_actor_id,
        channel: r.channel,
        title: r.title,
        body: r.body,
        tags: r.tags,
        gridCellId: r.grid_cell_id,
        endorsementCount: r.endorsement_count,
        createdAt: r.created_at
      }))
    };
  }

  async registerAccountAndCreateSession(
    input: RegisterVenueAccountInput,
    nowIso = new Date().toISOString()
  ): Promise<{ rawToken: string; account: DemoAccountRecord; profile: VenueProfileRecord; session: DemoSessionRecord }> {
    await this.ensureSeeded();
    const displayName = input.displayName.trim();
    if (!displayName) throw new Error('Display name is required');

    const coords = resolveGridCellCoordinates(input.gridCellId);
    const interestTags = validateVenueTags(input.interestTags);
    const strengthTags = validateVenueTags(input.strengthTags);

    const suffix = `${Date.now().toString(36)}-${generateSessionToken().slice(0, 8)}`;
    const actorId = `sim-user-${suffix}`;
    const accountId = `demo-acct-${suffix}`;
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.parse(nowIso) + DEFAULT_SESSION_TTL_MS).toISOString();
    const grants = defaultGrantsForRoleTrack(input.roleTrack);
    const ageInternal =
      typeof input.ageInternal === 'number' && Number.isFinite(input.ageInternal) ? Math.trunc(input.ageInternal) : null;
    const genderInternal = input.genderInternal?.trim() || null;

    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query(
        `INSERT INTO simulation.actor (id, kind, display_name, expertise)
         VALUES ($1,$2,$3,$4::jsonb)`,
        [
          actorId,
          actorKindForRoleTrack(input.roleTrack),
          displayName,
          JSON.stringify(strengthTags.map((label) => ({ label, evidence: null })))
        ]
      );
      await tx.query(
        `INSERT INTO simulation.actor_profile (actor_id, base_coordinates, available_transport_modes, willingness, note)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, '["徒歩","自転車","地域バス"]'::jsonb, $4, $5)`,
        [
          actorId,
          coords.longitude,
          coords.latitude,
          input.seekingMatch ? 'explicit-interest' : 'open',
          `固定グリッド ${input.gridCellId} から登録（模擬）`
        ]
      );
      await tx.query(
        `INSERT INTO simulation.venue_profile
           (actor_id, grid_cell_id, postal_code, interest_tags, strength_tags, bio, age_internal, gender_internal,
            seeking_match, org_certification_status, expert_certified, expert_certification_note, updated_at)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,'none',false,NULL,$10::timestamptz)`,
        [
          actorId,
          input.gridCellId,
          input.postalCode?.trim() || null,
          JSON.stringify(interestTags),
          JSON.stringify(strengthTags),
          input.bio?.trim() ?? '',
          ageInternal,
          genderInternal,
          Boolean(input.seekingMatch),
          nowIso
        ]
      );
      await tx.query(
        `INSERT INTO simulation.demo_account
           (id, display_name, role_track, actor_id, operated_actor_ids, grants, created_at, revoked_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::timestamptz,NULL)`,
        [accountId, displayName, input.roleTrack, actorId, JSON.stringify([actorId]), JSON.stringify(grants), nowIso]
      );
      await tx.query(
        `INSERT INTO simulation.demo_session
           (token_hash, account_id, mode, werewolf_room_id, created_at, expires_at, revoked_at)
         VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,NULL)`,
        [tokenHash, accountId, input.mode ?? 'standard', input.werewolfRoomId ?? null, nowIso, expiresAt]
      );
      await tx.query('COMMIT');
    } catch (err) {
      await tx.query('ROLLBACK');
      throw err;
    } finally {
      tx.release();
    }

    return {
      rawToken,
      account: {
        id: accountId,
        displayName,
        roleTrack: input.roleTrack,
        actorId,
        operatedActorIds: [actorId],
        grants,
        createdAt: nowIso,
        revokedAt: null
      },
      profile: {
        actorId,
        gridCellId: input.gridCellId,
        postalCode: input.postalCode?.trim() || null,
        interestTags,
        strengthTags,
        bio: input.bio?.trim() ?? '',
        ageInternal,
        genderInternal,
        seekingMatch: Boolean(input.seekingMatch),
        orgCertificationStatus: 'none',
        expertCertified: false,
        expertCertificationNote: null,
        updatedAt: nowIso
      },
      session: {
        tokenHash,
        accountId,
        mode: input.mode ?? 'standard',
        werewolfRoomId: input.werewolfRoomId ?? null,
        createdAt: nowIso,
        expiresAt,
        revokedAt: null
      }
    };
  }

  async createSessionForAccount(
    accountId: string,
    options?: { mode?: 'standard' | 'werewolf'; werewolfRoomId?: string | null; nowIso?: string }
  ): Promise<{ rawToken: string; session: DemoSessionRecord; account: DemoAccountRecord }> {
    await this.ensureSeeded();
    const res = await this.pool.query<{
      id: string;
      display_name: string;
      role_track: VenueRoleTrack;
      actor_id: string;
      operated_actor_ids: string[];
      grants: DemoAccountRecord['grants'];
      created_at: string;
      revoked_at: string | null;
    }>(
      'SELECT id, display_name, role_track, actor_id, operated_actor_ids, grants, created_at::text, revoked_at::text FROM simulation.demo_account WHERE id = $1',
      [accountId]
    );
    const row = res.rows[0];
    if (!row || row.revoked_at !== null) {
      throw new Error(`Demo account not found or revoked: ${accountId}`);
    }

    const nowIso = options?.nowIso ?? new Date().toISOString();
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.parse(nowIso) + DEFAULT_SESSION_TTL_MS).toISOString();

    await this.pool.query(
      `INSERT INTO simulation.demo_session
         (token_hash, account_id, mode, werewolf_room_id, created_at, expires_at, revoked_at)
       VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,NULL)`,
      [tokenHash, row.id, options?.mode ?? 'standard', options?.werewolfRoomId ?? null, nowIso, expiresAt]
    );

    return {
      rawToken,
      session: {
        tokenHash,
        accountId: row.id,
        mode: options?.mode ?? 'standard',
        werewolfRoomId: options?.werewolfRoomId ?? null,
        createdAt: nowIso,
        expiresAt,
        revokedAt: null
      },
      account: {
        id: row.id,
        displayName: row.display_name,
        roleTrack: row.role_track,
        actorId: row.actor_id,
        operatedActorIds: row.operated_actor_ids,
        grants: row.grants,
        createdAt: row.created_at,
        revokedAt: row.revoked_at
      }
    };
  }

  async resolveSessionByToken(
    rawToken: string | null | undefined,
    nowIso = new Date().toISOString()
  ): Promise<ResolvedVenueSession> {
    await this.ensureSeeded();
    if (!rawToken || !rawToken.trim()) {
      return { authenticated: false, session: null, account: null, profile: null, authContext: { authenticated: false } };
    }
    const tokenHash = hashSessionToken(rawToken.trim());
    const res = await this.pool.query<{
      token_hash: string;
      account_id: string;
      mode: 'standard' | 'werewolf';
      werewolf_room_id: string | null;
      session_created_at: string;
      expires_at: string;
      session_revoked_at: string | null;
      display_name: string;
      role_track: VenueRoleTrack;
      actor_id: string;
      operated_actor_ids: string[];
      grants: DemoAccountRecord['grants'];
      account_created_at: string;
      account_revoked_at: string | null;
      grid_cell_id: string | null;
      postal_code: string | null;
      interest_tags: VenueTag[] | null;
      strength_tags: VenueTag[] | null;
      bio: string | null;
      age_internal: number | null;
      gender_internal: string | null;
      seeking_match: boolean | null;
      org_certification_status: VenueProfileRecord['orgCertificationStatus'] | null;
      expert_certified: boolean | null;
      expert_certification_note: string | null;
      profile_updated_at: string | null;
    }>(
      `SELECT
         s.token_hash, s.account_id, s.mode, s.werewolf_room_id,
         s.created_at::text AS session_created_at, s.expires_at::text, s.revoked_at::text AS session_revoked_at,
         a.display_name, a.role_track, a.actor_id, a.operated_actor_ids, a.grants,
         a.created_at::text AS account_created_at, a.revoked_at::text AS account_revoked_at,
         p.grid_cell_id, p.postal_code, p.interest_tags, p.strength_tags, p.bio,
         p.age_internal, p.gender_internal, p.seeking_match,
         p.org_certification_status, p.expert_certified, p.expert_certification_note,
         p.updated_at::text AS profile_updated_at
       FROM simulation.demo_session s
       JOIN simulation.demo_account a ON a.id = s.account_id
       LEFT JOIN simulation.venue_profile p ON p.actor_id = a.actor_id
       WHERE s.token_hash = $1`,
      [tokenHash]
    );

    const r = res.rows[0];
    if (!r) {
      return { authenticated: false, session: null, account: null, profile: null, authContext: { authenticated: false } };
    }

    const session: DemoSessionRecord = {
      tokenHash: r.token_hash,
      accountId: r.account_id,
      mode: r.mode,
      werewolfRoomId: r.werewolf_room_id,
      createdAt: r.session_created_at,
      expiresAt: r.expires_at,
      revokedAt: r.session_revoked_at
    };
    const account: DemoAccountRecord = {
      id: r.account_id,
      displayName: r.display_name,
      roleTrack: r.role_track,
      actorId: r.actor_id,
      operatedActorIds: r.operated_actor_ids,
      grants: r.grants,
      createdAt: r.account_created_at,
      revokedAt: r.account_revoked_at
    };
    const authContext = resolveVenueServerAuthContext(session, account, nowIso);
    if (!authContext.authenticated) {
      return { authenticated: false, session: null, account: null, profile: null, authContext: { authenticated: false } };
    }

    const profile: VenueProfileRecord | null = r.profile_updated_at
      ? {
          actorId: r.actor_id,
          gridCellId: r.grid_cell_id,
          postalCode: r.postal_code,
          interestTags: r.interest_tags ?? [],
          strengthTags: r.strength_tags ?? [],
          bio: r.bio ?? '',
          ageInternal: r.age_internal,
          genderInternal: r.gender_internal,
          seekingMatch: Boolean(r.seeking_match),
          orgCertificationStatus: r.org_certification_status ?? 'none',
          expertCertified: Boolean(r.expert_certified),
          expertCertificationNote: r.expert_certification_note,
          updatedAt: r.profile_updated_at
        }
      : null;

    return { authenticated: true, session, account, profile, authContext };
  }

  async revokeSessionByToken(
    rawToken: string | null | undefined,
    nowIso = new Date().toISOString()
  ): Promise<void> {
    await this.ensureSeeded();
    if (!rawToken || !rawToken.trim()) return;
    const tokenHash = hashSessionToken(rawToken.trim());
    await this.pool.query(
      'UPDATE simulation.demo_session SET revoked_at = $2::timestamptz WHERE token_hash = $1',
      [tokenHash, nowIso]
    );
  }
}
