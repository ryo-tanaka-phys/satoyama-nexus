import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import {
  defaultGrantsForRoleTrack,
  resolveGridCellCoordinates,
  resolveVenueServerAuthContext,
  toPublicVenueProfile,
  toStructuredVenueMatchingInput,
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

export interface SocialCommentRecord {
  id: string;
  postId: string;
  authorActorId: string;
  body: string;
  isExpertAdvice: boolean;
  createdAt: string;
}

export type ActiveConnectionSupportStatus =
  | 'unsupported-informal'
  | 'activity-applied'
  | 'officially-supported';

export interface ActiveConnectionRecord {
  id: string;
  fromActorId: string;
  toActorId: string;
  postId: string | null;
  supportStatus: ActiveConnectionSupportStatus;
  note: string;
  createdAt: string;
}

export type VenueNotificationCategory =
  | 'matching'
  | 'corporate-offer'
  | 'government-action'
  | 'certification'
  | 'social';

export interface VenueNotificationRecord {
  id: string;
  recipientActorId: string;
  category: VenueNotificationCategory;
  title: string;
  body: string;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

export type CertificationKind = 'organization' | 'expert';
export type CertificationStatus = 'pending' | 'approved' | 'rejected';

export interface CertificationRequestRecord {
  id: string;
  kind: CertificationKind;
  applicantAccountId: string;
  targetActorId: string;
  organizationName: string | null;
  summary: string;
  evidenceNote: string | null;
  status: CertificationStatus;
  reviewerAccountId: string | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface VenueAuditEventRecord {
  id: string;
  actorAccountId: string | null;
  action: string;
  targetId: string;
  outcome: 'allowed' | 'denied';
  reasonCode: string;
  detailSummary: Readonly<Record<string, unknown>>;
  occurredAt: string;
}

export interface MediatedAIPrimaryAssessment {
  recommendationId: string;
  citizenActorId: string;
  targetOrgActorId: string;
  distanceMeters: number | null;
  matchedTags: readonly VenueTag[];
  triageSignal: 'recommended-for-human-review' | 'caution-human-review' | 'insufficient-evidence-for-review';
  status: 'requires-human-review';
  externalApiCalled: false;
  rationale: string;
  requiredHumanChecks: readonly string[];
  generatedAt: string;
}

export interface VenueFoundationSnapshot {
  actors: readonly Actor[];
  publicProfiles: readonly PublicVenueProfileView[];
  demoAccounts: readonly DemoAccountRecord[];
  corporateSponsors: readonly CorporateSponsorRecord[];
  corporatePlans: readonly CorporateSupportPlanRecord[];
  memberships: readonly SeedDummyMembership[];
  initialPosts: readonly SeedSocialPost[];
  comments: readonly SocialCommentRecord[];
  activeConnections: readonly ActiveConnectionRecord[];
  certificationRequests: readonly CertificationRequestRecord[];
  auditEvents: readonly VenueAuditEventRecord[];
}

export interface SubmitCertificationRequestInput {
  kind: CertificationKind;
  applicantAccountId: string;
  targetActorId: string;
  organizationName?: string | null;
  summary: string;
  evidenceNote?: string | null;
}

export interface ReviewCertificationRequestInput {
  requestId: string;
  reviewerAccountId: string;
  reviewerOperatedActorIds: readonly string[];
  decision: 'approved' | 'rejected';
  reason: string;
}

export interface RunMediatedAIReviewInput {
  operatorAccountId: string;
  citizenActorId: string;
  targetOrgActorId: string;
}

export interface SubmitMediatedHumanReviewInput {
  reviewerAccountId: string;
  reviewerOperatedActorIds: readonly string[];
  citizenActorId: string;
  targetOrgActorId: string;
  recommendationId: string | null;
  decision: 'approved' | 'rejected';
  reason: string;
}

export interface CreateSocialPostInput {
  authorActorId: string;
  channel: 'horizontal' | 'public-offer' | 'activity-log';
  title: string;
  body: string;
  tags: readonly string[];
  gridCellId?: string | null;
}

export interface AddSocialCommentInput {
  postId: string;
  authorActorId: string;
  body: string;
}

export interface CreateActiveConnectionInput {
  fromActorId: string;
  toActorId: string;
  postId?: string | null;
  note?: string;
}

export interface UpdateOwnProfileInput {
  actorId: string;
  bio?: string;
  seekingMatch?: boolean;
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
  createSocialPost(input: CreateSocialPostInput, nowIso?: string): Promise<SeedSocialPost>;
  addSocialComment(input: AddSocialCommentInput, nowIso?: string): Promise<SocialCommentRecord>;
  endorseSocialPost(postId: string): Promise<SeedSocialPost>;
  createActiveConnection(input: CreateActiveConnectionInput, nowIso?: string): Promise<ActiveConnectionRecord>;
  updateOwnProfile(input: UpdateOwnProfileInput, nowIso?: string): Promise<VenueProfileRecord>;
  listNotificationsForActor(actorId: string): Promise<readonly VenueNotificationRecord[]>;
  markNotificationRead(notificationId: string, recipientActorId: string): Promise<boolean>;
  submitCertificationRequest(
    input: SubmitCertificationRequestInput,
    nowIso?: string
  ): Promise<CertificationRequestRecord>;
  reviewCertificationRequest(
    input: ReviewCertificationRequestInput,
    nowIso?: string
  ): Promise<
    | { ok: true; request: CertificationRequestRecord; auditEvent: VenueAuditEventRecord }
    | { ok: false; reasonCode: string; message: string; auditEvent: VenueAuditEventRecord }
  >;
  runMediatedAIPrimaryReview(
    input: RunMediatedAIReviewInput,
    nowIso?: string
  ): Promise<{ assessment: MediatedAIPrimaryAssessment; auditEvent: VenueAuditEventRecord }>;
  submitMediatedHumanReview(
    input: SubmitMediatedHumanReviewInput,
    nowIso?: string
  ): Promise<
    | { ok: true; auditEvent: VenueAuditEventRecord; notificationSent: boolean }
    | { ok: false; reasonCode: string; message: string; auditEvent: VenueAuditEventRecord }
  >;
  recordVenueAuditEvent(
    input: Omit<VenueAuditEventRecord, 'id' | 'occurredAt'>,
    nowIso?: string
  ): Promise<VenueAuditEventRecord>;
}

function haversineDistanceMeters(
  a: { latitude: number; longitude: number } | null,
  b: { latitude: number; longitude: number } | null
): number | null {
  if (!a || !b) return null;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

function buildMediatedAIAssessment(
  citizenProfile: VenueProfileRecord,
  orgProfile: VenueProfileRecord,
  recommendationId: string,
  nowIso: string
): MediatedAIPrimaryAssessment {
  // Strictly uses structured matching projection ONLY (bio, ageInternal, genderInternal excluded)
  const citizenStruct = toStructuredVenueMatchingInput(citizenProfile);
  const orgStruct = toStructuredVenueMatchingInput(orgProfile);

  const distanceMeters = haversineDistanceMeters(citizenStruct.baseCoordinates, orgStruct.baseCoordinates);
  const matchedTags = citizenStruct.structuredTags.filter((t) => orgStruct.structuredTags.includes(t));

  let triageSignal: MediatedAIPrimaryAssessment['triageSignal'] = 'caution-human-review';
  if (orgProfile.orgCertificationStatus !== 'certified' || distanceMeters === null) {
    triageSignal = 'insufficient-evidence-for-review';
  } else if (matchedTags.length >= 1 && distanceMeters <= 6000) {
    triageSignal = 'recommended-for-human-review';
  }

  const requiredHumanChecks: string[] = [
    '距離のみで参加可能と断定せず、交通手段・日程の適合性を人間の二次審査で確認すること'
  ];
  if (orgProfile.orgCertificationStatus !== 'certified') {
    requiredHumanChecks.push('対象団体が未認証のため、公式サポート対象とする前に団体認証を確認すること');
  }
  if (matchedTags.length === 0) {
    requiredHumanChecks.push('構造化タグの一致がないため、初心者の受入体制を人間が確認すること');
  }

  const distText = distanceMeters !== null ? `直線距離 約${(distanceMeters / 1000).toFixed(2)}km` : '座標未設定';
  const tagText = matchedTags.length > 0 ? `一致タグ: ${matchedTags.join('・')}` : '一致タグなし';

  return {
    recommendationId,
    citizenActorId: citizenProfile.actorId,
    targetOrgActorId: orgProfile.actorId,
    distanceMeters,
    matchedTags,
    triageSignal,
    status: 'requires-human-review',
    externalApiCalled: false,
    rationale: `【AI一次評価（自己紹介テキスト非入力・構造化データのみ）】${distText}／${tagText}。最終判断は運営者の人間二次審査に委ねます。`,
    requiredHumanChecks,
    generatedAt: nowIso
  };
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
  private comments: SocialCommentRecord[] = [];
  private activeConnections: ActiveConnectionRecord[] = [];
  private notifications: VenueNotificationRecord[] = [];
  private certificationRequests: CertificationRequestRecord[] = [];
  private auditEvents: VenueAuditEventRecord[] = [];
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
      initialPosts: structuredClone(this.initialPosts),
      comments: structuredClone(this.comments),
      activeConnections: structuredClone(this.activeConnections),
      certificationRequests: structuredClone(this.certificationRequests),
      auditEvents: structuredClone(this.auditEvents)
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

  async createSocialPost(input: CreateSocialPostInput, nowIso = new Date().toISOString()): Promise<SeedSocialPost> {
    await this.ensureSeeded();
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) throw new Error('タイトルと本文を入力してください。');
    const tags = validateVenueTags(input.tags);
    const gridCellId = input.gridCellId?.trim() || this.profiles.get(input.authorActorId)?.gridCellId || 'grid-r1-c2';
    resolveGridCellCoordinates(gridCellId);

    const post: SeedSocialPost = {
      id: `post-${Date.now().toString(36)}-${this.seq++}`,
      authorActorId: input.authorActorId,
      channel: input.channel,
      title,
      body,
      tags,
      gridCellId,
      endorsementCount: 0,
      createdAt: nowIso
    };
    this.initialPosts.unshift(post);
    return structuredClone(post);
  }

  async addSocialComment(input: AddSocialCommentInput, nowIso = new Date().toISOString()): Promise<SocialCommentRecord> {
    await this.ensureSeeded();
    const body = input.body.trim();
    if (!body) throw new Error('コメント本文を入力してください。');
    const post = this.initialPosts.find((p) => p.id === input.postId);
    if (!post) throw new Error('対象の投稿が見つかりません。');

    const authorProfile = this.profiles.get(input.authorActorId);
    const authorActor = this.actors.find((a) => a.id === input.authorActorId);
    // Server strictly determines expert advice badge from verified certification status
    const isExpertAdvice = Boolean(authorProfile?.expertCertified);

    const comment: SocialCommentRecord = {
      id: `cmt-${Date.now().toString(36)}-${this.seq++}`,
      postId: post.id,
      authorActorId: input.authorActorId,
      body,
      isExpertAdvice,
      createdAt: nowIso
    };
    this.comments.push(comment);

    if (post.authorActorId !== input.authorActorId) {
      this.notifications.unshift({
        id: `notif-${Date.now().toString(36)}-${this.seq++}`,
        recipientActorId: post.authorActorId,
        category: 'social',
        title: isExpertAdvice
          ? `【認証済み専門家の助言】「${post.title}」にコメントが届きました`
          : `「${post.title}」にコメントが届きました`,
        body: `${authorActor?.displayName ?? input.authorActorId}：${body.slice(0, 80)}`,
        referenceId: post.id,
        isRead: false,
        createdAt: nowIso
      });
    }

    return structuredClone(comment);
  }

  async endorseSocialPost(postId: string): Promise<SeedSocialPost> {
    await this.ensureSeeded();
    const post = this.initialPosts.find((p) => p.id === postId);
    if (!post) throw new Error('対象の投稿が見つかりません。');
    post.endorsementCount += 1;
    return structuredClone(post);
  }

  async createActiveConnection(
    input: CreateActiveConnectionInput,
    nowIso = new Date().toISOString()
  ): Promise<ActiveConnectionRecord> {
    await this.ensureSeeded();
    if (input.fromActorId === input.toActorId) {
      throw new Error('自分自身には能動マッチング接続できません。');
    }
    const fromActor = this.actors.find((a) => a.id === input.fromActorId);
    const toActor = this.actors.find((a) => a.id === input.toActorId);
    if (!fromActor || !toActor) {
      throw new Error('接続対象のアカウントが見つかりません。');
    }
    const note = input.note?.trim() || '自己紹介・投稿を見て能動マッチングでつながりを申請しました。';
    const conn: ActiveConnectionRecord = {
      id: `conn-${Date.now().toString(36)}-${this.seq++}`,
      fromActorId: input.fromActorId,
      toActorId: input.toActorId,
      postId: input.postId?.trim() || null,
      // Smooth active connection starts explicitly unsupported until formal certification/application
      supportStatus: 'unsupported-informal',
      note,
      createdAt: nowIso
    };
    this.activeConnections.unshift(conn);

    this.notifications.unshift({
      id: `notif-${Date.now().toString(36)}-${this.seq++}`,
      recipientActorId: input.toActorId,
      category: 'matching',
      title: `能動マッチング接続：${fromActor.displayName} さんからつながり通知`,
      body: `${note}（※正式な団体認証・活動申請まではプラットフォームサポート対象外）`,
      referenceId: conn.id,
      isRead: false,
      createdAt: nowIso
    });

    return structuredClone(conn);
  }

  async updateOwnProfile(input: UpdateOwnProfileInput, nowIso = new Date().toISOString()): Promise<VenueProfileRecord> {
    await this.ensureSeeded();
    const existing = this.profiles.get(input.actorId);
    if (!existing) throw new Error('プロフィールが見つかりません。');
    if (typeof input.bio === 'string') {
      existing.bio = input.bio.trim();
    }
    if (typeof input.seekingMatch === 'boolean') {
      existing.seekingMatch = input.seekingMatch;
    }
    existing.updatedAt = nowIso;
    return structuredClone(existing);
  }

  async listNotificationsForActor(actorId: string): Promise<readonly VenueNotificationRecord[]> {
    await this.ensureSeeded();
    return structuredClone(this.notifications.filter((n) => n.recipientActorId === actorId));
  }

  async markNotificationRead(notificationId: string, recipientActorId: string): Promise<boolean> {
    await this.ensureSeeded();
    const target = this.notifications.find(
      (n) => n.id === notificationId && n.recipientActorId === recipientActorId
    );
    if (!target) return false;
    target.isRead = true;
    return true;
  }

  async recordVenueAuditEvent(
    input: Omit<VenueAuditEventRecord, 'id' | 'occurredAt'>,
    nowIso = new Date().toISOString()
  ): Promise<VenueAuditEventRecord> {
    await this.ensureSeeded();
    const ev: VenueAuditEventRecord = {
      id: `vaudit-${Date.now().toString(36)}-${this.seq++}`,
      actorAccountId: input.actorAccountId,
      action: input.action,
      targetId: input.targetId,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      detailSummary: structuredClone(input.detailSummary),
      occurredAt: nowIso
    };
    this.auditEvents.unshift(ev);
    return structuredClone(ev);
  }

  async submitCertificationRequest(
    input: SubmitCertificationRequestInput,
    nowIso = new Date().toISOString()
  ): Promise<CertificationRequestRecord> {
    await this.ensureSeeded();
    const summary = input.summary.trim();
    if (!summary) throw new Error('申請内容・理由を入力してください。');
    const targetActor = this.actors.find((a) => a.id === input.targetActorId);
    const targetProfile = this.profiles.get(input.targetActorId);
    if (!targetActor || !targetProfile) throw new Error('対象アカウントが見つかりません。');

    if (input.kind === 'organization' && targetActor.kind !== 'organization') {
      throw new Error('市民団体認証は市民団体アカウントのみ申請できます。');
    }
    if (input.kind === 'expert' && targetActor.kind !== 'person') {
      throw new Error('専門家資格認証は一般市民（個人）枠アカウントのみ申請できます。');
    }

    const req: CertificationRequestRecord = {
      id: `cert-${Date.now().toString(36)}-${this.seq++}`,
      kind: input.kind,
      applicantAccountId: input.applicantAccountId,
      targetActorId: input.targetActorId,
      organizationName: input.kind === 'organization' ? (input.organizationName?.trim() || targetActor.displayName) : null,
      summary,
      evidenceNote: input.evidenceNote?.trim() || null,
      status: 'pending',
      reviewerAccountId: null,
      reviewReason: null,
      reviewedAt: null,
      createdAt: nowIso
    };
    this.certificationRequests.unshift(req);

    if (input.kind === 'organization') {
      targetProfile.orgCertificationStatus = 'pending';
      targetProfile.updatedAt = nowIso;
    }

    // Notify operator accounts
    for (const acct of this.accounts.values()) {
      if (acct.roleTrack === 'operator' && acct.revokedAt === null) {
        this.notifications.unshift({
          id: `notif-${Date.now().toString(36)}-${this.seq++}`,
          recipientActorId: acct.actorId,
          category: 'certification',
          title:
            input.kind === 'organization'
              ? `【団体認証申請】${targetActor.displayName} から法人格・責任者認証の申請`
              : `【専門家資格認証申請】${targetActor.displayName} から資格認証の申請`,
          body: summary,
          referenceId: req.id,
          isRead: false,
          createdAt: nowIso
        });
      }
    }

    await this.recordVenueAuditEvent(
      {
        actorAccountId: input.applicantAccountId,
        action: `certification.${input.kind}.submit`,
        targetId: req.id,
        outcome: 'allowed',
        reasonCode: 'SUBMITTED',
        detailSummary: { targetActorId: input.targetActorId, kind: input.kind }
      },
      nowIso
    );

    return structuredClone(req);
  }

  async reviewCertificationRequest(
    input: ReviewCertificationRequestInput,
    nowIso = new Date().toISOString()
  ): Promise<
    | { ok: true; request: CertificationRequestRecord; auditEvent: VenueAuditEventRecord }
    | { ok: false; reasonCode: string; message: string; auditEvent: VenueAuditEventRecord }
  > {
    await this.ensureSeeded();
    const reason = input.reason.trim();
    if (!reason) {
      const auditEvent = await this.recordVenueAuditEvent(
        {
          actorAccountId: input.reviewerAccountId,
          action: 'certification.review',
          targetId: input.requestId,
          outcome: 'denied',
          reasonCode: 'REVIEW_REASON_REQUIRED',
          detailSummary: { decision: input.decision }
        },
        nowIso
      );
      return { ok: false, reasonCode: 'REVIEW_REASON_REQUIRED', message: '審査理由を入力してください。', auditEvent };
    }

    const req = this.certificationRequests.find((r) => r.id === input.requestId);
    if (!req) {
      const auditEvent = await this.recordVenueAuditEvent(
        {
          actorAccountId: input.reviewerAccountId,
          action: 'certification.review',
          targetId: input.requestId,
          outcome: 'denied',
          reasonCode: 'CERTIFICATION_REQUEST_NOT_FOUND',
          detailSummary: {}
        },
        nowIso
      );
      return { ok: false, reasonCode: 'CERTIFICATION_REQUEST_NOT_FOUND', message: '対象の認証申請が見つかりません。', auditEvent };
    }

    // ADR 0002 self-review prohibition
    if (
      req.applicantAccountId === input.reviewerAccountId ||
      input.reviewerOperatedActorIds.includes(req.targetActorId)
    ) {
      const auditEvent = await this.recordVenueAuditEvent(
        {
          actorAccountId: input.reviewerAccountId,
          action: `certification.${req.kind}.review`,
          targetId: req.id,
          outcome: 'denied',
          reasonCode: 'SELF_REVIEW_PROHIBITED',
          detailSummary: { applicantAccountId: req.applicantAccountId, targetActorId: req.targetActorId }
        },
        nowIso
      );
      return {
        ok: false,
        reasonCode: 'SELF_REVIEW_PROHIBITED',
        message: '自己審査は禁止されています。申請者とは独立した運営審査担当が審査してください。',
        auditEvent
      };
    }

    req.status = input.decision;
    req.reviewerAccountId = input.reviewerAccountId;
    req.reviewReason = reason;
    req.reviewedAt = nowIso;

    const targetProfile = this.profiles.get(req.targetActorId);
    if (targetProfile) {
      if (req.kind === 'organization') {
        targetProfile.orgCertificationStatus = input.decision === 'approved' ? 'certified' : 'rejected';
        if (input.decision === 'approved') {
          const applicantAcct = this.accounts.get(req.applicantAccountId);
          if (applicantAcct && !applicantAcct.operatedActorIds.includes(req.targetActorId)) {
            applicantAcct.operatedActorIds = [...applicantAcct.operatedActorIds, req.targetActorId];
          }
          // Record leader certification membership
          const existsLeader = this.memberships.some(
            (m) => m.personActorId === req.targetActorId && m.organizationActorId === req.targetActorId
          );
          if (!existsLeader) {
            this.memberships.push({
              personActorId: req.targetActorId,
              organizationActorId: req.targetActorId,
              role: 'leader',
              isDummy: false,
              certifiedByAccountId: input.reviewerAccountId,
              certifiedAt: nowIso
            });
          }
        }
      } else {
        targetProfile.expertCertified = input.decision === 'approved';
        targetProfile.expertCertificationNote = input.decision === 'approved' ? reason : null;
      }
      targetProfile.updatedAt = nowIso;
    }

    this.notifications.unshift({
      id: `notif-${Date.now().toString(36)}-${this.seq++}`,
      recipientActorId: req.targetActorId,
      category: 'certification',
      title:
        req.kind === 'organization'
          ? input.decision === 'approved'
            ? '【団体認証完了】市民団体認証・責任者権限が承認されました'
            : '【団体認証見送り】市民団体認証が却下されました'
          : input.decision === 'approved'
            ? '【専門家資格認証完了】認証済み専門家バッジが付与されました'
            : '【専門家資格認証見送り】資格認証が却下されました',
      body: `運営審査理由：${reason}`,
      referenceId: req.id,
      isRead: false,
      createdAt: nowIso
    });

    const auditEvent = await this.recordVenueAuditEvent(
      {
        actorAccountId: input.reviewerAccountId,
        action: `certification.${req.kind}.review`,
        targetId: req.id,
        outcome: 'allowed',
        reasonCode: input.decision === 'approved' ? 'CERTIFICATION_APPROVED' : 'CERTIFICATION_REJECTED',
        detailSummary: {
          kind: req.kind,
          targetActorId: req.targetActorId,
          decision: input.decision,
          reason
        }
      },
      nowIso
    );

    return { ok: true, request: structuredClone(req), auditEvent };
  }

  async runMediatedAIPrimaryReview(
    input: RunMediatedAIReviewInput,
    nowIso = new Date().toISOString()
  ): Promise<{ assessment: MediatedAIPrimaryAssessment; auditEvent: VenueAuditEventRecord }> {
    await this.ensureSeeded();
    const citizenProfile = this.profiles.get(input.citizenActorId);
    const orgProfile = this.profiles.get(input.targetOrgActorId);
    if (!citizenProfile || !orgProfile) {
      throw new Error('対象の市民または団体プロフィールが見つかりません。');
    }

    const recId = `med-ai-${Date.now().toString(36)}-${this.seq++}`;
    const assessment = buildMediatedAIAssessment(citizenProfile, orgProfile, recId, nowIso);

    const auditEvent = await this.recordVenueAuditEvent(
      {
        actorAccountId: input.operatorAccountId,
        action: 'mediated-match.ai-review',
        targetId: recId,
        outcome: 'allowed',
        reasonCode: 'AI_PRIMARY_RECORDED',
        detailSummary: {
          recommendationId: recId,
          citizenActorId: assessment.citizenActorId,
          targetOrgActorId: assessment.targetOrgActorId,
          distanceMeters: assessment.distanceMeters,
          matchedTags: assessment.matchedTags,
          triageSignal: assessment.triageSignal,
          status: assessment.status,
          externalApiCalled: false,
          rationale: assessment.rationale
        }
      },
      nowIso
    );

    return { assessment, auditEvent };
  }

  async submitMediatedHumanReview(
    input: SubmitMediatedHumanReviewInput,
    nowIso = new Date().toISOString()
  ): Promise<
    | { ok: true; auditEvent: VenueAuditEventRecord; notificationSent: boolean }
    | { ok: false; reasonCode: string; message: string; auditEvent: VenueAuditEventRecord }
  > {
    await this.ensureSeeded();
    const reason = input.reason.trim();
    if (!reason) {
      const auditEvent = await this.recordVenueAuditEvent(
        {
          actorAccountId: input.reviewerAccountId,
          action: 'mediated-match.human-review',
          targetId: `${input.citizenActorId}:${input.targetOrgActorId}`,
          outcome: 'denied',
          reasonCode: 'REVIEW_REASON_REQUIRED',
          detailSummary: {}
        },
        nowIso
      );
      return { ok: false, reasonCode: 'REVIEW_REASON_REQUIRED', message: '人間二次審査の理由を入力してください。', auditEvent };
    }

    // Self-review prohibition
    if (
      input.reviewerOperatedActorIds.includes(input.citizenActorId) ||
      input.reviewerOperatedActorIds.includes(input.targetOrgActorId)
    ) {
      const auditEvent = await this.recordVenueAuditEvent(
        {
          actorAccountId: input.reviewerAccountId,
          action: 'mediated-match.human-review',
          targetId: `${input.citizenActorId}:${input.targetOrgActorId}`,
          outcome: 'denied',
          reasonCode: 'SELF_REVIEW_PROHIBITED',
          detailSummary: { citizenActorId: input.citizenActorId, targetOrgActorId: input.targetOrgActorId }
        },
        nowIso
      );
      return {
        ok: false,
        reasonCode: 'SELF_REVIEW_PROHIBITED',
        message: '当事者を操作するアカウントによる自己審査は禁止されています。',
        auditEvent
      };
    }

    // Requirement 4: AI primary evaluation MUST exist before human secondary review
    const recId = input.recommendationId?.trim() ?? '';
    const matchingAiEvent = this.auditEvents.find(
      (ev) =>
        ev.action === 'mediated-match.ai-review' &&
        ev.outcome === 'allowed' &&
        ev.targetId === recId &&
        ev.detailSummary.citizenActorId === input.citizenActorId &&
        ev.detailSummary.targetOrgActorId === input.targetOrgActorId
    );
    if (!recId || !matchingAiEvent) {
      const auditEvent = await this.recordVenueAuditEvent(
        {
          actorAccountId: input.reviewerAccountId,
          action: 'mediated-match.human-review',
          targetId: `${input.citizenActorId}:${input.targetOrgActorId}`,
          outcome: 'denied',
          reasonCode: 'AI_RECOMMENDATION_REQUIRED',
          detailSummary: { recommendationId: recId || null }
        },
        nowIso
      );
      return {
        ok: false,
        reasonCode: 'AI_RECOMMENDATION_REQUIRED',
        message: '要件4により、先にAI一次評価を実行して推薦IDを参照しない限り人間二次審査を実行できません。',
        auditEvent
      };
    }

    const citizenActor = this.actors.find((a) => a.id === input.citizenActorId);
    const orgActor = this.actors.find((a) => a.id === input.targetOrgActorId);

    const auditEvent = await this.recordVenueAuditEvent(
      {
        actorAccountId: input.reviewerAccountId,
        action: 'mediated-match.human-review',
        targetId: recId,
        outcome: 'allowed',
        reasonCode: input.decision === 'approved' ? 'MEDIATED_MATCH_APPROVED' : 'MEDIATED_MATCH_REJECTED',
        detailSummary: {
          recommendationId: recId,
          citizenActorId: input.citizenActorId,
          targetOrgActorId: input.targetOrgActorId,
          decision: input.decision,
          reason
        }
      },
      nowIso
    );

    if (input.decision === 'approved') {
      this.notifications.unshift({
        id: `notif-${Date.now().toString(36)}-${this.seq++}`,
        recipientActorId: input.citizenActorId,
        category: 'matching',
        title: `【運営仲介・厳格審査承認】${orgActor?.displayName ?? input.targetOrgActorId} のおすすめ通知`,
        body: `AI一次評価 (${recId}) と運営者の人間二次審査を経てご案内します。理由：${reason}`,
        referenceId: recId,
        isRead: false,
        createdAt: nowIso
      });
      this.notifications.unshift({
        id: `notif-${Date.now().toString(36)}-${this.seq++}`,
        recipientActorId: input.targetOrgActorId,
        category: 'matching',
        title: `【運営仲介・厳格審査承認】紹介希望の ${citizenActor?.displayName ?? input.citizenActorId} さんをご案内`,
        body: `AI一次評価 (${recId}) と運営者の人間二次審査を経てマッチング通知を発行しました。理由：${reason}`,
        referenceId: recId,
        isRead: false,
        createdAt: nowIso
      });
      return { ok: true, auditEvent, notificationSent: true };
    }

    return { ok: true, auditEvent, notificationSent: false };
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
    const [
      actorRes,
      profileRes,
      accountRes,
      sponsorRes,
      planRes,
      memRes,
      postRes,
      commentRes,
      connRes,
      certRes,
      auditRes
    ] = await Promise.all([
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
        }>(
          'SELECT actor_id, grid_cell_id, postal_code, interest_tags, strength_tags, bio, age_internal, gender_internal, seeking_match, org_certification_status, expert_certified, expert_certification_note, updated_at::text FROM simulation.venue_profile ORDER BY actor_id ASC'
        ),
        this.pool.query<{
          id: string;
          display_name: string;
          role_track: VenueRoleTrack;
          actor_id: string;
          operated_actor_ids: string[];
          grants: DemoAccountRecord['grants'];
          created_at: string;
          revoked_at: string | null;
        }>(
          'SELECT id, display_name, role_track, actor_id, operated_actor_ids, grants, created_at::text, revoked_at::text FROM simulation.demo_account ORDER BY created_at ASC'
        ),
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
        }>(
          'SELECT id, sponsor_id, title, support_type, summary, required_tags, requires_certified_org, requires_activity_report, requires_expert_advice FROM simulation.corporate_support_plan ORDER BY id ASC'
        ),
        this.pool.query<{
          person_actor_id: string;
          organization_actor_id: string;
          role: 'leader' | 'member';
          is_dummy: boolean;
          certified_by_account_id: string | null;
          certified_at: string | null;
        }>(
          'SELECT person_actor_id, organization_actor_id, role, is_dummy, certified_by_account_id, certified_at::text FROM simulation.actor_membership'
        ),
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
        }>(
          'SELECT id, author_actor_id, channel, title, body, tags, grid_cell_id, endorsement_count, created_at::text FROM simulation.social_post ORDER BY created_at DESC'
        ),
        this.pool.query<{
          id: string;
          post_id: string;
          author_actor_id: string;
          body: string;
          is_expert_advice: boolean;
          created_at: string;
        }>(
          'SELECT id, post_id, author_actor_id, body, is_expert_advice, created_at::text FROM simulation.social_comment ORDER BY created_at ASC'
        ),
        this.pool.query<{
          id: string;
          from_actor_id: string;
          to_actor_id: string;
          post_id: string | null;
          support_status: ActiveConnectionSupportStatus;
          note: string;
          created_at: string;
        }>(
          'SELECT id, from_actor_id, to_actor_id, post_id, support_status, note, created_at::text FROM simulation.active_connection ORDER BY created_at DESC'
        ),
        this.pool.query<{
          id: string;
          kind: CertificationKind;
          applicant_account_id: string;
          target_actor_id: string;
          organization_name: string | null;
          summary: string;
          evidence_note: string | null;
          status: CertificationStatus;
          reviewer_account_id: string | null;
          review_reason: string | null;
          reviewed_at: string | null;
          created_at: string;
        }>(
          'SELECT id, kind, applicant_account_id, target_actor_id, organization_name, summary, evidence_note, status, reviewer_account_id, review_reason, reviewed_at::text, created_at::text FROM simulation.certification_request ORDER BY created_at DESC'
        ),
        this.pool.query<{
          id: string;
          actor_account_id: string | null;
          action: string;
          target_id: string;
          outcome: 'allowed' | 'denied';
          reason_code: string;
          detail_summary: Record<string, unknown>;
          occurred_at: string;
        }>(
          'SELECT id, actor_account_id, action, target_id, outcome, reason_code, detail_summary, occurred_at::text FROM ops_audit.venue_audit_event ORDER BY occurred_at DESC LIMIT 100'
        )
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
      })),
      comments: commentRes.rows.map((r) => ({
        id: r.id,
        postId: r.post_id,
        authorActorId: r.author_actor_id,
        body: r.body,
        isExpertAdvice: r.is_expert_advice,
        createdAt: r.created_at
      })),
      activeConnections: connRes.rows.map((r) => ({
        id: r.id,
        fromActorId: r.from_actor_id,
        toActorId: r.to_actor_id,
        postId: r.post_id,
        supportStatus: r.support_status,
        note: r.note,
        createdAt: r.created_at
      })),
      certificationRequests: certRes.rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        applicantAccountId: r.applicant_account_id,
        targetActorId: r.target_actor_id,
        organizationName: r.organization_name,
        summary: r.summary,
        evidenceNote: r.evidence_note,
        status: r.status,
        reviewerAccountId: r.reviewer_account_id,
        reviewReason: r.review_reason,
        reviewedAt: r.reviewed_at,
        createdAt: r.created_at
      })),
      auditEvents: auditRes.rows.map((r) => ({
        id: r.id,
        actorAccountId: r.actor_account_id,
        action: r.action,
        targetId: r.target_id,
        outcome: r.outcome,
        reasonCode: r.reason_code,
        detailSummary: r.detail_summary,
        occurredAt: r.occurred_at
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

  async createSocialPost(input: CreateSocialPostInput, nowIso = new Date().toISOString()): Promise<SeedSocialPost> {
    await this.ensureSeeded();
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) throw new Error('タイトルと本文を入力してください。');
    const tags = validateVenueTags(input.tags);

    let gridCellId = input.gridCellId?.trim() ?? '';
    if (!gridCellId) {
      const profRes = await this.pool.query<{ grid_cell_id: string | null }>(
        'SELECT grid_cell_id FROM simulation.venue_profile WHERE actor_id = $1',
        [input.authorActorId]
      );
      gridCellId = profRes.rows[0]?.grid_cell_id || 'grid-r1-c2';
    }
    resolveGridCellCoordinates(gridCellId);

    const id = `post-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;
    await this.pool.query(
      `INSERT INTO simulation.social_post
         (id, author_actor_id, channel, title, body, tags, grid_cell_id, endorsement_count, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,0,$8::timestamptz)`,
      [id, input.authorActorId, input.channel, title, body, JSON.stringify(tags), gridCellId, nowIso]
    );
    return {
      id,
      authorActorId: input.authorActorId,
      channel: input.channel,
      title,
      body,
      tags,
      gridCellId,
      endorsementCount: 0,
      createdAt: nowIso
    };
  }

  async addSocialComment(input: AddSocialCommentInput, nowIso = new Date().toISOString()): Promise<SocialCommentRecord> {
    await this.ensureSeeded();
    const body = input.body.trim();
    if (!body) throw new Error('コメント本文を入力してください。');

    const postRes = await this.pool.query<{ id: string; author_actor_id: string; title: string }>(
      'SELECT id, author_actor_id, title FROM simulation.social_post WHERE id = $1',
      [input.postId]
    );
    const post = postRes.rows[0];
    if (!post) throw new Error('対象の投稿が見つかりません。');

    const authorRes = await this.pool.query<{ display_name: string; expert_certified: boolean | null }>(
      `SELECT a.display_name, p.expert_certified
       FROM simulation.actor a
       LEFT JOIN simulation.venue_profile p ON p.actor_id = a.id
       WHERE a.id = $1`,
      [input.authorActorId]
    );
    const isExpertAdvice = Boolean(authorRes.rows[0]?.expert_certified);
    const authorName = authorRes.rows[0]?.display_name ?? input.authorActorId;

    const id = `cmt-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;
    await this.pool.query(
      `INSERT INTO simulation.social_comment (id, post_id, author_actor_id, body, is_expert_advice, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::timestamptz)`,
      [id, post.id, input.authorActorId, body, isExpertAdvice, nowIso]
    );

    if (post.author_actor_id !== input.authorActorId) {
      const notifId = `notif-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;
      await this.pool.query(
        `INSERT INTO simulation.venue_notification
           (id, recipient_actor_id, category, title, body, reference_id, is_read, created_at)
         VALUES ($1,$2,'social',$3,$4,$5,false,$6::timestamptz)`,
        [
          notifId,
          post.author_actor_id,
          isExpertAdvice
            ? `【認証済み専門家の助言】「${post.title}」にコメントが届きました`
            : `「${post.title}」にコメントが届きました`,
          `${authorName}：${body.slice(0, 80)}`,
          post.id,
          nowIso
        ]
      );
    }

    return {
      id,
      postId: post.id,
      authorActorId: input.authorActorId,
      body,
      isExpertAdvice,
      createdAt: nowIso
    };
  }

  async endorseSocialPost(postId: string): Promise<SeedSocialPost> {
    await this.ensureSeeded();
    const res = await this.pool.query<{
      id: string;
      author_actor_id: string;
      channel: SeedSocialPost['channel'];
      title: string;
      body: string;
      tags: VenueTag[];
      grid_cell_id: string;
      endorsement_count: number;
      created_at: string;
    }>(
      `UPDATE simulation.social_post
       SET endorsement_count = endorsement_count + 1
       WHERE id = $1
       RETURNING id, author_actor_id, channel, title, body, tags, grid_cell_id, endorsement_count, created_at::text`,
      [postId]
    );
    const r = res.rows[0];
    if (!r) throw new Error('対象の投稿が見つかりません。');
    return {
      id: r.id,
      authorActorId: r.author_actor_id,
      channel: r.channel,
      title: r.title,
      body: r.body,
      tags: r.tags,
      gridCellId: r.grid_cell_id,
      endorsementCount: r.endorsement_count,
      createdAt: r.created_at
    };
  }

  async createActiveConnection(
    input: CreateActiveConnectionInput,
    nowIso = new Date().toISOString()
  ): Promise<ActiveConnectionRecord> {
    await this.ensureSeeded();
    if (input.fromActorId === input.toActorId) {
      throw new Error('自分自身には能動マッチング接続できません。');
    }
    const actorsRes = await this.pool.query<{ id: string; display_name: string }>(
      'SELECT id, display_name FROM simulation.actor WHERE id = ANY($1::text[])',
      [[input.fromActorId, input.toActorId]]
    );
    const fromActor = actorsRes.rows.find((a) => a.id === input.fromActorId);
    const toActor = actorsRes.rows.find((a) => a.id === input.toActorId);
    if (!fromActor || !toActor) {
      throw new Error('接続対象のアカウントが見つかりません。');
    }

    const note = input.note?.trim() || '自己紹介・投稿を見て能動マッチングでつながりを申請しました。';
    const id = `conn-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;
    const notifId = `notif-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;

    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query(
        `INSERT INTO simulation.active_connection
           (id, from_actor_id, to_actor_id, post_id, support_status, note, created_at)
         VALUES ($1,$2,$3,$4,'unsupported-informal',$5,$6::timestamptz)`,
        [id, input.fromActorId, input.toActorId, input.postId?.trim() || null, note, nowIso]
      );
      await tx.query(
        `INSERT INTO simulation.venue_notification
           (id, recipient_actor_id, category, title, body, reference_id, is_read, created_at)
         VALUES ($1,$2,'matching',$3,$4,$5,false,$6::timestamptz)`,
        [
          notifId,
          input.toActorId,
          `能動マッチング接続：${fromActor.display_name} さんからつながり通知`,
          `${note}（※正式な団体認証・活動申請まではプラットフォームサポート対象外）`,
          id,
          nowIso
        ]
      );
      await tx.query('COMMIT');
    } catch (err) {
      await tx.query('ROLLBACK');
      throw err;
    } finally {
      tx.release();
    }

    return {
      id,
      fromActorId: input.fromActorId,
      toActorId: input.toActorId,
      postId: input.postId?.trim() || null,
      supportStatus: 'unsupported-informal',
      note,
      createdAt: nowIso
    };
  }

  async updateOwnProfile(input: UpdateOwnProfileInput, nowIso = new Date().toISOString()): Promise<VenueProfileRecord> {
    await this.ensureSeeded();
    const res = await this.pool.query<{
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
    }>(
      `UPDATE simulation.venue_profile
       SET bio = COALESCE($2, bio),
           seeking_match = COALESCE($3, seeking_match),
           updated_at = $4::timestamptz
       WHERE actor_id = $1
       RETURNING actor_id, grid_cell_id, postal_code, interest_tags, strength_tags, bio, age_internal, gender_internal,
                 seeking_match, org_certification_status, expert_certified, expert_certification_note, updated_at::text`,
      [
        input.actorId,
        typeof input.bio === 'string' ? input.bio.trim() : null,
        typeof input.seekingMatch === 'boolean' ? input.seekingMatch : null,
        nowIso
      ]
    );
    const r = res.rows[0];
    if (!r) throw new Error('プロフィールが見つかりません。');
    if (typeof input.seekingMatch === 'boolean') {
      await this.pool.query(
        'UPDATE simulation.actor_profile SET willingness = $2 WHERE actor_id = $1',
        [input.actorId, input.seekingMatch ? 'explicit-interest' : 'open']
      );
    }
    return {
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
    };
  }

  async listNotificationsForActor(actorId: string): Promise<readonly VenueNotificationRecord[]> {
    await this.ensureSeeded();
    const res = await this.pool.query<{
      id: string;
      recipient_actor_id: string;
      category: VenueNotificationCategory;
      title: string;
      body: string;
      reference_id: string | null;
      is_read: boolean;
      created_at: string;
    }>(
      `SELECT id, recipient_actor_id, category, title, body, reference_id, is_read, created_at::text
       FROM simulation.venue_notification
       WHERE recipient_actor_id = $1
       ORDER BY created_at DESC`,
      [actorId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      recipientActorId: r.recipient_actor_id,
      category: r.category,
      title: r.title,
      body: r.body,
      referenceId: r.reference_id,
      isRead: r.is_read,
      createdAt: r.created_at
    }));
  }

  async markNotificationRead(notificationId: string, recipientActorId: string): Promise<boolean> {
    await this.ensureSeeded();
    const res = await this.pool.query(
      'UPDATE simulation.venue_notification SET is_read = true WHERE id = $1 AND recipient_actor_id = $2',
      [notificationId, recipientActorId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async recordVenueAuditEvent(
    input: Omit<VenueAuditEventRecord, 'id' | 'occurredAt'>,
    nowIso = new Date().toISOString()
  ): Promise<VenueAuditEventRecord> {
    await this.ensureSeeded();
    const id = `vaudit-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;
    await this.pool.query(
      `INSERT INTO ops_audit.venue_audit_event
         (id, actor_account_id, action, target_id, outcome, reason_code, detail_summary, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::timestamptz)`,
      [
        id,
        input.actorAccountId,
        input.action,
        input.targetId,
        input.outcome,
        input.reasonCode,
        JSON.stringify(input.detailSummary),
        nowIso
      ]
    );
    return {
      id,
      actorAccountId: input.actorAccountId,
      action: input.action,
      targetId: input.targetId,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      detailSummary: input.detailSummary,
      occurredAt: nowIso
    };
  }

  async submitCertificationRequest(
    input: SubmitCertificationRequestInput,
    nowIso = new Date().toISOString()
  ): Promise<CertificationRequestRecord> {
    await this.ensureSeeded();
    const summary = input.summary.trim();
    if (!summary) throw new Error('申請内容・理由を入力してください。');

    const actorRes = await this.pool.query<{ id: string; kind: Actor['kind']; display_name: string }>(
      'SELECT id, kind, display_name FROM simulation.actor WHERE id = $1',
      [input.targetActorId]
    );
    const targetActor = actorRes.rows[0];
    if (!targetActor) throw new Error('対象アカウントが見つかりません。');
    if (input.kind === 'organization' && targetActor.kind !== 'organization') {
      throw new Error('市民団体認証は市民団体アカウントのみ申請できます。');
    }
    if (input.kind === 'expert' && targetActor.kind !== 'person') {
      throw new Error('専門家資格認証は一般市民（個人）枠アカウントのみ申請できます。');
    }

    const id = `cert-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;
    const orgName = input.kind === 'organization' ? (input.organizationName?.trim() || targetActor.display_name) : null;
    const evidenceNote = input.evidenceNote?.trim() || null;

    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query(
        `INSERT INTO simulation.certification_request
           (id, kind, applicant_account_id, target_actor_id, organization_name, summary, evidence_note, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8::timestamptz)`,
        [id, input.kind, input.applicantAccountId, input.targetActorId, orgName, summary, evidenceNote, nowIso]
      );
      if (input.kind === 'organization') {
        await tx.query(
          `UPDATE simulation.venue_profile SET org_certification_status = 'pending', updated_at = $2::timestamptz WHERE actor_id = $1`,
          [input.targetActorId, nowIso]
        );
      }
      const opRes = await tx.query<{ actor_id: string }>(
        `SELECT actor_id FROM simulation.demo_account WHERE role_track = 'operator' AND revoked_at IS NULL`
      );
      for (const op of opRes.rows) {
        const notifId = `notif-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;
        await tx.query(
          `INSERT INTO simulation.venue_notification
             (id, recipient_actor_id, category, title, body, reference_id, is_read, created_at)
           VALUES ($1,$2,'certification',$3,$4,$5,false,$6::timestamptz)`,
          [
            notifId,
            op.actor_id,
            input.kind === 'organization'
              ? `【団体認証申請】${targetActor.display_name} から法人格・責任者認証の申請`
              : `【専門家資格認証申請】${targetActor.display_name} から資格認証の申請`,
            summary,
            id,
            nowIso
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

    await this.recordVenueAuditEvent(
      {
        actorAccountId: input.applicantAccountId,
        action: `certification.${input.kind}.submit`,
        targetId: id,
        outcome: 'allowed',
        reasonCode: 'SUBMITTED',
        detailSummary: { targetActorId: input.targetActorId, kind: input.kind }
      },
      nowIso
    );

    return {
      id,
      kind: input.kind,
      applicantAccountId: input.applicantAccountId,
      targetActorId: input.targetActorId,
      organizationName: orgName,
      summary,
      evidenceNote,
      status: 'pending',
      reviewerAccountId: null,
      reviewReason: null,
      reviewedAt: null,
      createdAt: nowIso
    };
  }

  async reviewCertificationRequest(
    input: ReviewCertificationRequestInput,
    nowIso = new Date().toISOString()
  ): Promise<
    | { ok: true; request: CertificationRequestRecord; auditEvent: VenueAuditEventRecord }
    | { ok: false; reasonCode: string; message: string; auditEvent: VenueAuditEventRecord }
  > {
    await this.ensureSeeded();
    const reason = input.reason.trim();
    if (!reason) {
      const auditEvent = await this.recordVenueAuditEvent(
        {
          actorAccountId: input.reviewerAccountId,
          action: 'certification.review',
          targetId: input.requestId,
          outcome: 'denied',
          reasonCode: 'REVIEW_REASON_REQUIRED',
          detailSummary: { decision: input.decision }
        },
        nowIso
      );
      return { ok: false, reasonCode: 'REVIEW_REASON_REQUIRED', message: '審査理由を入力してください。', auditEvent };
    }

    const reqRes = await this.pool.query<{
      id: string;
      kind: CertificationKind;
      applicant_account_id: string;
      target_actor_id: string;
      organization_name: string | null;
      summary: string;
      evidence_note: string | null;
      status: CertificationStatus;
      created_at: string;
    }>(
      `SELECT id, kind, applicant_account_id, target_actor_id, organization_name, summary, evidence_note, status, created_at::text
       FROM simulation.certification_request WHERE id = $1`,
      [input.requestId]
    );
    const r = reqRes.rows[0];
    if (!r) {
      const auditEvent = await this.recordVenueAuditEvent(
        {
          actorAccountId: input.reviewerAccountId,
          action: 'certification.review',
          targetId: input.requestId,
          outcome: 'denied',
          reasonCode: 'CERTIFICATION_REQUEST_NOT_FOUND',
          detailSummary: {}
        },
        nowIso
      );
      return { ok: false, reasonCode: 'CERTIFICATION_REQUEST_NOT_FOUND', message: '対象の認証申請が見つかりません。', auditEvent };
    }

    if (
      r.applicant_account_id === input.reviewerAccountId ||
      input.reviewerOperatedActorIds.includes(r.target_actor_id)
    ) {
      const auditEvent = await this.recordVenueAuditEvent(
        {
          actorAccountId: input.reviewerAccountId,
          action: `certification.${r.kind}.review`,
          targetId: r.id,
          outcome: 'denied',
          reasonCode: 'SELF_REVIEW_PROHIBITED',
          detailSummary: { applicantAccountId: r.applicant_account_id, targetActorId: r.target_actor_id }
        },
        nowIso
      );
      return {
        ok: false,
        reasonCode: 'SELF_REVIEW_PROHIBITED',
        message: '自己審査は禁止されています。申請者とは独立した運営審査担当が審査してください。',
        auditEvent
      };
    }

    const auditId = `vaudit-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;
    const notifId = `notif-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;
    const reasonCode = input.decision === 'approved' ? 'CERTIFICATION_APPROVED' : 'CERTIFICATION_REJECTED';

    const tx = await this.pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query(
        `UPDATE simulation.certification_request
         SET status = $2, reviewer_account_id = $3, review_reason = $4, reviewed_at = $5::timestamptz
         WHERE id = $1`,
        [r.id, input.decision, input.reviewerAccountId, reason, nowIso]
      );

      if (r.kind === 'organization') {
        await tx.query(
          `UPDATE simulation.venue_profile
           SET org_certification_status = $2, updated_at = $3::timestamptz
           WHERE actor_id = $1`,
          [r.target_actor_id, input.decision === 'approved' ? 'certified' : 'rejected', nowIso]
        );
        if (input.decision === 'approved') {
          await tx.query(
            `INSERT INTO simulation.actor_membership
               (person_actor_id, organization_actor_id, role, is_dummy, certified_by_account_id, certified_at)
             VALUES ($1,$1,'leader',false,$2,$3::timestamptz)
             ON CONFLICT (person_actor_id, organization_actor_id)
             DO UPDATE SET role = 'leader', certified_by_account_id = EXCLUDED.certified_by_account_id, certified_at = EXCLUDED.certified_at`,
            [r.target_actor_id, input.reviewerAccountId, nowIso]
          );
        }
      } else {
        await tx.query(
          `UPDATE simulation.venue_profile
           SET expert_certified = $2, expert_certification_note = $3, updated_at = $4::timestamptz
           WHERE actor_id = $1`,
          [r.target_actor_id, input.decision === 'approved', input.decision === 'approved' ? reason : null, nowIso]
        );
      }

      await tx.query(
        `INSERT INTO simulation.venue_notification
           (id, recipient_actor_id, category, title, body, reference_id, is_read, created_at)
         VALUES ($1,$2,'certification',$3,$4,$5,false,$6::timestamptz)`,
        [
          notifId,
          r.target_actor_id,
          r.kind === 'organization'
            ? input.decision === 'approved'
              ? '【団体認証完了】市民団体認証・責任者権限が承認されました'
              : '【団体認証見送り】市民団体認証が却下されました'
            : input.decision === 'approved'
              ? '【専門家資格認証完了】認証済み専門家バッジが付与されました'
              : '【専門家資格認証見送り】資格認証が却下されました',
          `運営審査理由：${reason}`,
          r.id,
          nowIso
        ]
      );

      await tx.query(
        `INSERT INTO ops_audit.venue_audit_event
           (id, actor_account_id, action, target_id, outcome, reason_code, detail_summary, occurred_at)
         VALUES ($1,$2,$3,$4,'allowed',$5,$6::jsonb,$7::timestamptz)`,
        [
          auditId,
          input.reviewerAccountId,
          `certification.${r.kind}.review`,
          r.id,
          reasonCode,
          JSON.stringify({ kind: r.kind, targetActorId: r.target_actor_id, decision: input.decision, reason }),
          nowIso
        ]
      );

      await tx.query('COMMIT');
    } catch (err) {
      await tx.query('ROLLBACK');
      throw err;
    } finally {
      tx.release();
    }

    return {
      ok: true,
      request: {
        id: r.id,
        kind: r.kind,
        applicantAccountId: r.applicant_account_id,
        targetActorId: r.target_actor_id,
        organizationName: r.organization_name,
        summary: r.summary,
        evidenceNote: r.evidence_note,
        status: input.decision,
        reviewerAccountId: input.reviewerAccountId,
        reviewReason: reason,
        reviewedAt: nowIso,
        createdAt: r.created_at
      },
      auditEvent: {
        id: auditId,
        actorAccountId: input.reviewerAccountId,
        action: `certification.${r.kind}.review`,
        targetId: r.id,
        outcome: 'allowed',
        reasonCode,
        detailSummary: { kind: r.kind, targetActorId: r.target_actor_id, decision: input.decision, reason },
        occurredAt: nowIso
      }
    };
  }

  async runMediatedAIPrimaryReview(
    input: RunMediatedAIReviewInput,
    nowIso = new Date().toISOString()
  ): Promise<{ assessment: MediatedAIPrimaryAssessment; auditEvent: VenueAuditEventRecord }> {
    await this.ensureSeeded();
    const res = await this.pool.query<{
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
    }>(
      `SELECT actor_id, grid_cell_id, postal_code, interest_tags, strength_tags, bio, age_internal, gender_internal,
              seeking_match, org_certification_status, expert_certified, expert_certification_note, updated_at::text
       FROM simulation.venue_profile WHERE actor_id = ANY($1::text[])`,
      [[input.citizenActorId, input.targetOrgActorId]]
    );
    const toProf = (r: (typeof res.rows)[number]): VenueProfileRecord => ({
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
    });
    const citRow = res.rows.find((x) => x.actor_id === input.citizenActorId);
    const orgRow = res.rows.find((x) => x.actor_id === input.targetOrgActorId);
    if (!citRow || !orgRow) throw new Error('対象の市民または団体プロフィールが見つかりません。');

    const recId = `med-ai-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;
    const assessment = buildMediatedAIAssessment(toProf(citRow), toProf(orgRow), recId, nowIso);
    const auditEvent = await this.recordVenueAuditEvent(
      {
        actorAccountId: input.operatorAccountId,
        action: 'mediated-match.ai-review',
        targetId: recId,
        outcome: 'allowed',
        reasonCode: 'AI_PRIMARY_RECORDED',
        detailSummary: {
          recommendationId: recId,
          citizenActorId: assessment.citizenActorId,
          targetOrgActorId: assessment.targetOrgActorId,
          distanceMeters: assessment.distanceMeters,
          matchedTags: assessment.matchedTags,
          triageSignal: assessment.triageSignal,
          status: assessment.status,
          externalApiCalled: false,
          rationale: assessment.rationale
        }
      },
      nowIso
    );
    return { assessment, auditEvent };
  }

  async submitMediatedHumanReview(
    input: SubmitMediatedHumanReviewInput,
    nowIso = new Date().toISOString()
  ): Promise<
    | { ok: true; auditEvent: VenueAuditEventRecord; notificationSent: boolean }
    | { ok: false; reasonCode: string; message: string; auditEvent: VenueAuditEventRecord }
  > {
    await this.ensureSeeded();
    const reason = input.reason.trim();
    if (!reason) {
      const auditEvent = await this.recordVenueAuditEvent(
        {
          actorAccountId: input.reviewerAccountId,
          action: 'mediated-match.human-review',
          targetId: `${input.citizenActorId}:${input.targetOrgActorId}`,
          outcome: 'denied',
          reasonCode: 'REVIEW_REASON_REQUIRED',
          detailSummary: {}
        },
        nowIso
      );
      return { ok: false, reasonCode: 'REVIEW_REASON_REQUIRED', message: '人間二次審査の理由を入力してください。', auditEvent };
    }

    if (
      input.reviewerOperatedActorIds.includes(input.citizenActorId) ||
      input.reviewerOperatedActorIds.includes(input.targetOrgActorId)
    ) {
      const auditEvent = await this.recordVenueAuditEvent(
        {
          actorAccountId: input.reviewerAccountId,
          action: 'mediated-match.human-review',
          targetId: `${input.citizenActorId}:${input.targetOrgActorId}`,
          outcome: 'denied',
          reasonCode: 'SELF_REVIEW_PROHIBITED',
          detailSummary: { citizenActorId: input.citizenActorId, targetOrgActorId: input.targetOrgActorId }
        },
        nowIso
      );
      return {
        ok: false,
        reasonCode: 'SELF_REVIEW_PROHIBITED',
        message: '当事者を操作するアカウントによる自己審査は禁止されています。',
        auditEvent
      };
    }

    const recId = input.recommendationId?.trim() ?? '';
    const aiRes = await this.pool.query<{ id: string }>(
      `SELECT id FROM ops_audit.venue_audit_event
       WHERE action = 'mediated-match.ai-review'
         AND outcome = 'allowed'
         AND target_id = $1
         AND detail_summary->>'citizenActorId' = $2
         AND detail_summary->>'targetOrgActorId' = $3
       LIMIT 1`,
      [recId, input.citizenActorId, input.targetOrgActorId]
    );
    if (!recId || aiRes.rowCount === 0) {
      const auditEvent = await this.recordVenueAuditEvent(
        {
          actorAccountId: input.reviewerAccountId,
          action: 'mediated-match.human-review',
          targetId: `${input.citizenActorId}:${input.targetOrgActorId}`,
          outcome: 'denied',
          reasonCode: 'AI_RECOMMENDATION_REQUIRED',
          detailSummary: { recommendationId: recId || null }
        },
        nowIso
      );
      return {
        ok: false,
        reasonCode: 'AI_RECOMMENDATION_REQUIRED',
        message: '要件4により、先にAI一次評価を実行して推薦IDを参照しない限り人間二次審査を実行できません。',
        auditEvent
      };
    }

    const actorsRes = await this.pool.query<{ id: string; display_name: string }>(
      'SELECT id, display_name FROM simulation.actor WHERE id = ANY($1::text[])',
      [[input.citizenActorId, input.targetOrgActorId]]
    );
    const citName = actorsRes.rows.find((a) => a.id === input.citizenActorId)?.display_name ?? input.citizenActorId;
    const orgName = actorsRes.rows.find((a) => a.id === input.targetOrgActorId)?.display_name ?? input.targetOrgActorId;

    const auditEvent = await this.recordVenueAuditEvent(
      {
        actorAccountId: input.reviewerAccountId,
        action: 'mediated-match.human-review',
        targetId: recId,
        outcome: 'allowed',
        reasonCode: input.decision === 'approved' ? 'MEDIATED_MATCH_APPROVED' : 'MEDIATED_MATCH_REJECTED',
        detailSummary: {
          recommendationId: recId,
          citizenActorId: input.citizenActorId,
          targetOrgActorId: input.targetOrgActorId,
          decision: input.decision,
          reason
        }
      },
      nowIso
    );

    if (input.decision === 'approved') {
      const n1 = `notif-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;
      const n2 = `notif-${Date.now().toString(36)}-${generateSessionToken().slice(0, 6)}`;
      await this.pool.query(
        `INSERT INTO simulation.venue_notification
           (id, recipient_actor_id, category, title, body, reference_id, is_read, created_at)
         VALUES
           ($1,$2,'matching',$3,$4,$5,false,$6::timestamptz),
           ($7,$8,'matching',$9,$10,$5,false,$6::timestamptz)`,
        [
          n1,
          input.citizenActorId,
          `【運営仲介・厳格審査承認】${orgName} のおすすめ通知`,
          `AI一次評価 (${recId}) と運営者の人間二次審査を経てご案内します。理由：${reason}`,
          recId,
          nowIso,
          n2,
          input.targetOrgActorId,
          `【運営仲介・厳格審査承認】紹介希望の ${citName} さんをご案内`,
          `AI一次評価 (${recId}) と運営者の人間二次審査を経てマッチング通知を発行しました。理由：${reason}`
        ]
      );
      return { ok: true, auditEvent, notificationSent: true };
    }

    return { ok: true, auditEvent, notificationSent: false };
  }
}
