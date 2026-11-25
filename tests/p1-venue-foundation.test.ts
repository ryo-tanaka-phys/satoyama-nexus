import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkCertifiedOrganizationAccess,
  evaluateCorporateSupportPlans,
  formatPublicApprovalView,
  KYUSHU_GRID_CELLS,
  resolveGridCellCoordinates,
  resolvePostalCodeToGridCell,
  toPublicVenueProfile,
  toStructuredVenueMatchingInput,
  validateVenueTags,
  VENUE_TAGS
} from '../packages/domain/src';
import { loadMigrationFiles } from '../db/migrator';
import { InMemoryVenueFoundationStore } from '../db/venue-store';
import { buildKyushuVenueSeed } from '../apps/web/lib/venue-seed';
import {
  buildClearSessionCookieHeader,
  buildSessionSetCookieHeader,
  extractSessionTokenFromCookieHeader,
  findSpoofedClientAuthKey,
  generateSessionToken,
  hashSessionToken,
  VENUE_SESSION_COOKIE_NAME
} from '../apps/web/lib/venue-session';

const MIGRATIONS_DIR = resolve(process.cwd(), 'db/migrations');

describe('P1 Venue Foundation — Migration, Kyushu Grid, Tags, Privacy, Corporate Separation & Session Auth', () => {
  it('loads 0005_m5_m6_simulated_venue.sql as a forward-only additive migration with corporate and werewolf separation', async () => {
    const files = await loadMigrationFiles(MIGRATIONS_DIR);
    const m0005 = files.find((f) => f.version === '0005_m5_m6_simulated_venue.sql');
    expect(m0005).toBeDefined();
    expect(m0005!.sql).toContain('simulation.venue_profile');
    expect(m0005!.sql).toContain('simulation.demo_account');
    expect(m0005!.sql).toContain('simulation.demo_session');
    expect(m0005!.sql).toContain('simulation.corporate_sponsor');
    expect(m0005!.sql).toContain('simulation.corporate_support_plan');
    expect(m0005!.sql).toContain('simulation.corporate_support_offer');
    expect(m0005!.sql).toContain('simulation.demo_werewolf_room');
    expect(m0005!.sql).toContain('ops_audit.venue_audit_event');
    expect(m0005!.sql).not.toMatch(/\b(DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE)\b/i);
  });

  it('defines a 4x4 Kyushu University fixed grid (16 cells) and resolves local Ito/Itoshima postal codes', () => {
    expect(KYUSHU_GRID_CELLS).toHaveLength(16);
    const ids = new Set(KYUSHU_GRID_CELLS.map((c) => c.id));
    expect(ids.size).toBe(16);

    const itoEast = resolveGridCellCoordinates('grid-r1-c2');
    expect(itoEast.srid).toBe(4326);
    expect(itoEast.latitude).toBeGreaterThan(33.55);
    expect(itoEast.latitude).toBeLessThan(33.65);
    expect(itoEast.longitude).toBeGreaterThan(130.15);
    expect(itoEast.longitude).toBeLessThan(130.3);

    expect(() => resolveGridCellCoordinates('grid-invalid')).toThrow('Unknown Kyushu grid cell');

    const byPostal = resolvePostalCodeToGridCell('819-0395');
    expect(byPostal?.id).toBe('grid-r1-c2');
    expect(resolvePostalCodeToGridCell('000-0000')).toBeNull();
  });

  it('enforces the fixed 9-tag allowlist strictly for matching consistency', () => {
    expect(VENUE_TAGS).toHaveLength(9);
    expect(validateVenueTags(['竹林整備', '竹林整備', '安全管理'])).toEqual(['竹林整備', '安全管理']);
    expect(() => validateVenueTags(['竹林整備', '自由入力の未定義タグ'])).toThrow('Unsupported venue tag');
  });

  it('strips private internal demographics from public profile views and excludes free-text bio from AI/matching inputs', () => {
    const seed = buildKyushuVenueSeed();
    const citizenProfile = seed.venueProfiles.find((p) => p.actorId === 'sim-kyushu-cit-demo')!;
    expect(citizenProfile.ageInternal).toBe(22);
    expect(citizenProfile.genderInternal).toBe('未回答');
    expect(citizenProfile.bio.length).toBeGreaterThan(0);

    const publicView = toPublicVenueProfile(citizenProfile);
    expect(publicView).not.toHaveProperty('ageInternal');
    expect(publicView).not.toHaveProperty('genderInternal');
    expect(publicView.bio).toBe(citizenProfile.bio);
    expect(publicView.gridLabel).toBe('南・周船寺／学研都市');

    const matchingInput = toStructuredVenueMatchingInput(citizenProfile);
    expect(matchingInput).not.toHaveProperty('bio');
    expect(matchingInput).not.toHaveProperty('ageInternal');
    expect(matchingInput).not.toHaveProperty('genderInternal');
    expect(matchingInput.baseCoordinates?.srid).toBe(4326);
    expect(matchingInput.structuredTags).toContain('竹林整備');
    expect(matchingInput.willingness).toBe('explicit-interest');
  });

  it('keeps corporate sponsors physically separated from simulation.actor and evaluates all 3 support plans accurately', () => {
    const seed = buildKyushuVenueSeed();
    expect(seed.corporateSponsors).toHaveLength(3);
    expect(seed.corporatePlans).toHaveLength(3);
    // Corporate entities must never appear inside simulation.actor
    expect(seed.actors.every((a) => !a.id.startsWith('corp-'))).toBe(true);
    expect(seed.actors.every((a) => ['person', 'organization', 'government-body'].includes(a.kind))).toBe(true);

    // Uncertified org gets zero corporate offers
    const uncertifiedOffers = evaluateCorporateSupportPlans(seed.corporateSponsors, seed.corporatePlans, {
      targetActorId: 'sim-kyushu-org-demo',
      tags: ['竹林整備', '歩道整備'],
      isCertifiedOrganization: false,
      submittedReportCount: 0,
      expertAdviceCount: 0
    });
    expect(uncertifiedOffers).toHaveLength(0);

    // Certified org with bamboo tags gets materials plan immediately
    const materialsOnly = evaluateCorporateSupportPlans(seed.corporateSponsors, seed.corporatePlans, {
      targetActorId: 'sim-kyushu-org-demo',
      tags: ['竹林整備'],
      isCertifiedOrganization: true,
      submittedReportCount: 0,
      expertAdviceCount: 0
    });
    expect(materialsOnly.map((m) => m.plan.supportType)).toEqual(['materials']);

    // Certified org with tags + activity report + expert advice matches all 3 plans
    const allThree = evaluateCorporateSupportPlans(seed.corporateSponsors, seed.corporatePlans, {
      targetActorId: 'sim-kyushu-org-demo',
      tags: ['竹林整備'],
      isCertifiedOrganization: true,
      submittedReportCount: 1,
      expertAdviceCount: 1
    });
    expect(allThree.map((m) => m.plan.supportType)).toEqual(['materials', 'funding', 'safety-equipment']);
  });

  it('resolves server-side HttpOnly session cookies into ServerAuthContext, rejects spoofing keys, and gates uncertified orgs', async () => {
    const store = new InMemoryVenueFoundationStore();
    await store.ensureSeeded();

    // Spoofed client fields are detected and rejected
    expect(findSpoofedClientAuthKey({ displayName: 'x', role: 'operator' })).toBe('role');
    expect(findSpoofedClientAuthKey({ displayName: 'x', userAccountId: 'demo-acct-operator' })).toBe('userAccountId');
    expect(findSpoofedClientAuthKey({ displayName: 'x', gridCellId: 'grid-r1-c2' })).toBeNull();

    // Cookie round-trip helpers
    const raw = generateSessionToken();
    expect(hashSessionToken(raw)).toHaveLength(64);
    const setCookie = buildSessionSetCookieHeader(raw, { secure: true });
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(extractSessionTokenFromCookieHeader(`foo=1; ${VENUE_SESSION_COOKIE_NAME}=${raw}; bar=2`)).toBe(raw);
    expect(buildClearSessionCookieHeader()).toContain('Max-Age=0');

    // Demo organization starts uncertified -> access to org-only features must be denied
    const orgLogin = await store.createSessionForAccount('demo-acct-org', { nowIso: '2026-11-25T10:00:00Z' });
    const resolvedOrg = await store.resolveSessionByToken(orgLogin.rawToken, '2026-11-25T10:05:00Z');
    expect(resolvedOrg.authenticated).toBe(true);
    expect(resolvedOrg.authContext.authenticated).toBe(true);
    expect(resolvedOrg.profile?.orgCertificationStatus).toBe('none');

    const denied = checkCertifiedOrganizationAccess(resolvedOrg.authContext, resolvedOrg.profile);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reasonCode).toBe('ORGANIZATION_NOT_CERTIFIED');
    }

    // Once certified, the same organization leader gains access
    const allowed = checkCertifiedOrganizationAccess(resolvedOrg.authContext, {
      ...resolvedOrg.profile!,
      orgCertificationStatus: 'certified'
    });
    expect(allowed).toEqual({ ok: true });

    // Revoking or expiring the session immediately invalidates authContext
    await store.revokeSessionByToken(orgLogin.rawToken, '2026-11-25T10:10:00Z');
    const afterRevoke = await store.resolveSessionByToken(orgLogin.rawToken, '2026-11-25T10:11:00Z');
    expect(afterRevoke.authenticated).toBe(false);
    expect(afterRevoke.authContext).toEqual({ authenticated: false });

    // Registering a brand-new citizen account works end-to-end without leaking private age/gender
    const created = await store.registerAccountAndCreateSession(
      {
        displayName: '新規登録・伊都学生',
        roleTrack: 'citizen',
        gridCellId: 'grid-r1-c1',
        interestTags: ['植生観察', '記録/GIS'],
        strengthTags: ['広報'],
        bio: '九大で活動を探しています',
        ageInternal: 20,
        genderInternal: '非公開テスト',
        seekingMatch: true
      },
      '2026-11-25T10:15:00Z'
    );
    const resolvedNew = await store.resolveSessionByToken(created.rawToken, '2026-11-25T10:16:00Z');
    expect(resolvedNew.authenticated).toBe(true);
    expect(resolvedNew.account?.displayName).toBe('新規登録・伊都学生');

    const snap = await store.getFoundationSnapshot();
    const newPublic = snap.publicProfiles.find((p) => p.actorId === created.account.actorId);
    expect(newPublic).toBeDefined();
    expect(newPublic).not.toHaveProperty('ageInternal');
    expect(newPublic).not.toHaveProperty('genderInternal');
    // Dummy organization members exist and have no demo accounts
    expect(snap.memberships.filter((m) => m.isDummy)).toHaveLength(2);
    expect(snap.demoAccounts.some((a) => a.actorId === 'sim-kyushu-dummy-mem-1')).toBe(false);
  });

  it('switches public approval visibility cleanly between demo full-process and production outcome-only modes', () => {
    const steps = [
      {
        id: 'ev-1',
        actorAccountId: 'demo-acct-gov',
        fromStatus: 'submitted',
        toStatus: 'approved',
        reason: '簡易レポートの活動実績を確認し、資材保管支援を承認します。',
        recordedAt: '2026-11-25T11:00:00Z'
      }
    ];

    const demoView = formatPublicApprovalView({ status: 'approved', decidedAt: '2026-11-25T11:00:00Z', steps }, 'full-process');
    expect(demoView.processSteps).toHaveLength(1);
    expect(demoView.processSteps[0].reason).toContain('資材保管支援');

    const prodView = formatPublicApprovalView({ status: 'approved', decidedAt: '2026-11-25T11:00:00Z', steps }, 'outcome-only');
    expect(prodView.status).toBe('approved');
    expect(prodView.processSteps).toHaveLength(0);
  });
});
