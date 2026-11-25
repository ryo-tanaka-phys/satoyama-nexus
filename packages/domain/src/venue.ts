import type { GeoPoint4326 } from './location-conditions';
import type { PermissionGrant, ServerAuthContext } from './auth-review-audit';

/** Fixed 9 selectable tags for P1-P7 matching consistency (owner decision 2026-11-25). */
export const VENUE_TAGS = [
  '竹林整備',
  '植生観察',
  '水辺保全',
  '歩道整備',
  '自然観察会',
  '安全管理',
  '記録/GIS',
  '地域調整',
  '広報'
] as const;

export type VenueTag = (typeof VENUE_TAGS)[number];

export function isVenueTag(value: string): value is VenueTag {
  return (VENUE_TAGS as readonly string[]).includes(value);
}

/** Validates and deduplicates tags strictly against the 9-tag allowlist. */
export function validateVenueTags(tags: readonly string[]): VenueTag[] {
  const unique: VenueTag[] = [];
  for (const raw of tags) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!isVenueTag(trimmed)) {
      throw new Error(`Unsupported venue tag: ${trimmed}`);
    }
    if (!unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }
  return unique;
}

export interface KyushuGridCell {
  readonly id: string;
  readonly row: 0 | 1 | 2 | 3;
  readonly col: 0 | 1 | 2 | 3;
  readonly label: string;
  readonly areaNote: string;
  readonly coordinates: GeoPoint4326;
}

/**
 * 4x4 fixed grid (~1.5km step) centered around Kyushu University Ito Campus and surrounding
 * simulated satoyama areas (Motooka, Kuwabara, Susenji, Imajuku, Itoshima foothills).
 * All activities/actors placed here are simulated demo entities.
 */
export const KYUSHU_GRID_CELLS: readonly KyushuGridCell[] = [
  // Row 0 (North: ~33.618N)
  { id: 'grid-r0-c0', row: 0, col: 0, label: '北西・志摩里山エリア', areaNote: '模擬：北西部丘陵・竹林帯', coordinates: { srid: 4326, latitude: 33.618, longitude: 130.185 } },
  { id: 'grid-r0-c1', row: 0, col: 1, label: '北・元岡北部里山', areaNote: '模擬：湿地・水辺保全区画', coordinates: { srid: 4326, latitude: 33.618, longitude: 130.205 } },
  { id: 'grid-r0-c2', row: 0, col: 2, label: '北・桑原北側林縁', areaNote: '模擬：雑木林・観察歩道', coordinates: { srid: 4326, latitude: 33.618, longitude: 130.225 } },
  { id: 'grid-r0-c3', row: 0, col: 3, label: '北東・今津湾岸里山', areaNote: '模擬：沿岸林・野鳥観察帯', coordinates: { srid: 4326, latitude: 33.618, longitude: 130.245 } },
  // Row 1 (Center-North: ~33.600N — Kyushu Univ Ito Campus core)
  { id: 'grid-r1-c0', row: 1, col: 0, label: '西・泊／伊都西里山', areaNote: '模擬：西側竹林・農林境', coordinates: { srid: 4326, latitude: 33.600, longitude: 130.185 } },
  { id: 'grid-r1-c1', row: 1, col: 1, label: '九大伊都キャンパス西', areaNote: '模擬：キャンパス西側・生物多様性ゾーン', coordinates: { srid: 4326, latitude: 33.600, longitude: 130.205 } },
  { id: 'grid-r1-c2', row: 1, col: 2, label: '九大伊都キャンパス東・元岡', areaNote: '模擬：キャンパス東門・元岡交流拠点', coordinates: { srid: 4326, latitude: 33.600, longitude: 130.225 } },
  { id: 'grid-r1-c3', row: 1, col: 3, label: '東・桑原／今津里山', areaNote: '模擬：谷戸水辺・保全活動区画', coordinates: { srid: 4326, latitude: 33.600, longitude: 130.245 } },
  // Row 2 (Center-South: ~33.582N — Susenji / Academic Town)
  { id: 'grid-r2-c0', row: 2, col: 0, label: '南西・波多江／潤エリア', areaNote: '模擬：糸島側生活圏・河川沿い', coordinates: { srid: 4326, latitude: 33.582, longitude: 130.185 } },
  { id: 'grid-r2-c1', row: 2, col: 1, label: '南・伊都学研都市西', areaNote: '模擬：九大学研都市駅西・住宅/緑地', coordinates: { srid: 4326, latitude: 33.582, longitude: 130.205 } },
  { id: 'grid-r2-c2', row: 2, col: 2, label: '南・周船寺／学研都市', areaNote: '模擬：周船寺・市民交流拠点エリア', coordinates: { srid: 4326, latitude: 33.582, longitude: 130.225 } },
  { id: 'grid-r2-c3', row: 2, col: 3, label: '南東・今宿里山入口', areaNote: '模擬：今宿・長垂方面緑地帯', coordinates: { srid: 4326, latitude: 33.582, longitude: 130.245 } },
  // Row 3 (South: ~33.564N — Foothills / Mountain trails)
  { id: 'grid-r3-c0', row: 3, col: 0, label: '最南西・高祖山麓', areaNote: '模擬：山麓歩道・森林整備区画', coordinates: { srid: 4326, latitude: 33.564, longitude: 130.185 } },
  { id: 'grid-r3-c1', row: 3, col: 1, label: '最南・飯氏／千里里山', areaNote: '模擬：段々畑・ため池保全区画', coordinates: { srid: 4326, latitude: 33.564, longitude: 130.205 } },
  { id: 'grid-r3-c2', row: 3, col: 2, label: '最南・叶岳北麓', areaNote: '模擬：里山トレイル・安全点検帯', coordinates: { srid: 4326, latitude: 33.564, longitude: 130.225 } },
  { id: 'grid-r3-c3', row: 3, col: 3, label: '最南東・叶岳／今宿山麓', areaNote: '模擬：広葉樹林・自然観察会候補地', coordinates: { srid: 4326, latitude: 33.564, longitude: 130.245 } }
] as const;

export function findKyushuGridCell(gridCellId: string): KyushuGridCell | null {
  return KYUSHU_GRID_CELLS.find((cell) => cell.id === gridCellId) ?? null;
}

export function resolveGridCellCoordinates(gridCellId: string): GeoPoint4326 {
  const cell = findKyushuGridCell(gridCellId);
  if (!cell) {
    throw new Error(`Unknown Kyushu grid cell: ${gridCellId}`);
  }
  return { ...cell.coordinates };
}

/** Local deterministic postal-code helper for Kyushu Univ / Nishi-ku / Itoshima demo area (no external API). */
const LOCAL_POSTAL_TO_GRID: Readonly<Record<string, string>> = {
  '8190395': 'grid-r1-c2', // 九州大学伊都キャンパス（元岡）
  '8190385': 'grid-r1-c2', // 福岡市西区元岡
  '8190384': 'grid-r1-c3', // 福岡市西区桑原
  '8190373': 'grid-r2-c2', // 福岡市西区周船寺
  '8190366': 'grid-r2-c1', // 福岡市西区横浜/学研都市周辺
  '8190167': 'grid-r2-c3', // 福岡市西区今宿
  '8190165': 'grid-r0-c3', // 福岡市西区今津
  '8191107': 'grid-r2-c0', // 糸島市波多江周辺
  '8191112': 'grid-r1-c0', // 糸島市泊周辺
  '8191304': 'grid-r0-c0'  // 糸島市志摩方面
};

export function resolvePostalCodeToGridCell(rawPostalCode: string): KyushuGridCell | null {
  const digits = rawPostalCode.replace(/[^0-9]/g, '');
  if (digits.length !== 7) return null;
  const exact = LOCAL_POSTAL_TO_GRID[digits];
  if (exact) return findKyushuGridCell(exact);
  if (digits.startsWith('81903')) return findKyushuGridCell('grid-r1-c2');
  if (digits.startsWith('81901')) return findKyushuGridCell('grid-r2-c3');
  if (digits.startsWith('81911')) return findKyushuGridCell('grid-r2-c0');
  if (digits.startsWith('81913')) return findKyushuGridCell('grid-r0-c0');
  return null;
}

export type VenueRoleTrack = 'citizen' | 'organization' | 'government' | 'operator';
export type OrgCertificationStatus = 'none' | 'pending' | 'certified' | 'rejected';

/** Full server-side venue profile (includes private internal demographics & non-AI bio). */
export interface VenueProfileRecord {
  actorId: string;
  gridCellId: string | null;
  postalCode: string | null;
  interestTags: readonly VenueTag[];
  strengthTags: readonly VenueTag[];
  /** Self-introduction card for human active matching ONLY; strictly excluded from AI/matching engines. */
  bio: string;
  /** Internal only; never included in public profile views. */
  ageInternal: number | null;
  /** Internal only; never included in public profile views. */
  genderInternal: string | null;
  seekingMatch: boolean;
  orgCertificationStatus: OrgCertificationStatus;
  expertCertified: boolean;
  expertCertificationNote: string | null;
  updatedAt: string;
}

/** Public-safe profile view: internal age/gender are physically stripped. */
export interface PublicVenueProfileView {
  actorId: string;
  gridCellId: string | null;
  gridLabel: string | null;
  interestTags: readonly VenueTag[];
  strengthTags: readonly VenueTag[];
  bio: string;
  seekingMatch: boolean;
  orgCertificationStatus: OrgCertificationStatus;
  expertCertified: boolean;
  expertCertificationNote: string | null;
}

export function toPublicVenueProfile(profile: VenueProfileRecord): PublicVenueProfileView {
  const cell = profile.gridCellId ? findKyushuGridCell(profile.gridCellId) : null;
  return {
    actorId: profile.actorId,
    gridCellId: profile.gridCellId,
    gridLabel: cell?.label ?? null,
    interestTags: [...profile.interestTags],
    strengthTags: [...profile.strengthTags],
    bio: profile.bio,
    seekingMatch: profile.seekingMatch,
    orgCertificationStatus: profile.orgCertificationStatus,
    expertCertified: profile.expertCertified,
    expertCertificationNote: profile.expertCertificationNote
  };
}

/**
 * Projects a venue profile into structured matching inputs ONLY.
 * Deliberately excludes `bio`, `ageInternal`, and `genderInternal` so free-text bios
 * and private demographics never enter M2 matching or M3 AI primary evaluation.
 */
export interface StructuredVenueMatchingInput {
  actorId: string;
  baseCoordinates: GeoPoint4326 | null;
  structuredTags: readonly VenueTag[];
  willingness: 'explicit-interest' | 'open' | 'unknown';
}

export function toStructuredVenueMatchingInput(profile: VenueProfileRecord): StructuredVenueMatchingInput {
  const cell = profile.gridCellId ? findKyushuGridCell(profile.gridCellId) : null;
  const combined: VenueTag[] = [];
  for (const tag of [...profile.strengthTags, ...profile.interestTags]) {
    if (!combined.includes(tag)) combined.push(tag);
  }
  return {
    actorId: profile.actorId,
    baseCoordinates: cell ? { ...cell.coordinates } : null,
    structuredTags: combined,
    willingness: profile.seekingMatch ? 'explicit-interest' : 'open'
  };
}

export interface DemoAccountRecord {
  id: string;
  displayName: string;
  roleTrack: VenueRoleTrack;
  actorId: string;
  operatedActorIds: readonly string[];
  grants: readonly PermissionGrant[];
  createdAt: string;
  revokedAt: string | null;
}

export interface DemoSessionRecord {
  tokenHash: string;
  accountId: string;
  mode: 'standard' | 'werewolf';
  werewolfRoomId: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export function defaultGrantsForRoleTrack(roleTrack: VenueRoleTrack): PermissionGrant[] {
  switch (roleTrack) {
    case 'operator':
      return [
        { role: 'simulation-editor', scope: { kind: 'global' }, revokedAt: null, expiresAt: null },
        { role: 'reviewer', scope: { kind: 'global' }, revokedAt: null, expiresAt: null },
        { role: 'auditor', scope: { kind: 'global' }, revokedAt: null, expiresAt: null }
      ];
    case 'government':
      return [
        { role: 'simulation-editor', scope: { kind: 'global' }, revokedAt: null, expiresAt: null },
        { role: 'auditor', scope: { kind: 'global' }, revokedAt: null, expiresAt: null }
      ];
    case 'organization':
    case 'citizen':
    default:
      return [{ role: 'simulation-editor', scope: { kind: 'global' }, revokedAt: null, expiresAt: null }];
  }
}

/**
 * Resolves a server-verified session + account record into the M1 ServerAuthContext.
 * Client-supplied role/account fields are never accepted here.
 */
export function resolveVenueServerAuthContext(
  session: DemoSessionRecord | null,
  account: DemoAccountRecord | null,
  nowIso: string
): ServerAuthContext {
  if (!session || !account) return { authenticated: false };
  if (session.revokedAt !== null || account.revokedAt !== null) return { authenticated: false };
  if (session.accountId !== account.id) return { authenticated: false };
  const nowMs = Date.parse(nowIso);
  const expMs = Date.parse(session.expiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expMs) || expMs <= nowMs) {
    return { authenticated: false };
  }
  const operated = new Set<string>([account.actorId, ...account.operatedActorIds]);
  return {
    authenticated: true,
    userAccountId: account.id,
    grants: account.grants,
    operatedActorIds: [...operated],
    issuedAt: session.createdAt
  };
}

export type OrganizationAccessCheckResult =
  | { ok: true }
  | { ok: false; reasonCode: 'UNAUTHENTICATED' | 'ORGANIZATION_NOT_CERTIFIED' | 'FORBIDDEN_ORG_ACCESS'; message: string };

/**
 * Enforces the legal-entity-like organization certification gate:
 * Organization-only workspaces (calendar, member management, chat, reports, public petitions)
 * require both `orgCertificationStatus === 'certified'` and leader operation rights.
 */
export function checkCertifiedOrganizationAccess(
  auth: ServerAuthContext,
  organizationProfile: VenueProfileRecord | null
): OrganizationAccessCheckResult {
  if (!auth.authenticated) {
    return {
      ok: false,
      reasonCode: 'UNAUTHENTICATED',
      message: '市民団体機能の利用にはログインが必要です。'
    };
  }
  if (!organizationProfile || organizationProfile.orgCertificationStatus !== 'certified') {
    return {
      ok: false,
      reasonCode: 'ORGANIZATION_NOT_CERTIFIED',
      message: '運営による市民団体認証（法人格・責任者認証）が完了するまで団体専用機能は利用できません。'
    };
  }
  if (!auth.operatedActorIds.includes(organizationProfile.actorId)) {
    return {
      ok: false,
      reasonCode: 'FORBIDDEN_ORG_ACCESS',
      message: '当該市民団体の認証済み責任者アカウントではありません。'
    };
  }
  return { ok: true };
}

/** Separated corporate domain types (decoupled from simulation.actor). */
export type CorporateSupportType = 'materials' | 'funding' | 'safety-equipment';

export interface CorporateSponsorRecord {
  id: string;
  name: string;
  industry: string;
  summary: string;
}

export interface CorporateSupportPlanRecord {
  id: string;
  sponsorId: string;
  title: string;
  supportType: CorporateSupportType;
  summary: string;
  requiredTags: readonly VenueTag[];
  requiresCertifiedOrg: boolean;
  requiresActivityReport: boolean;
  requiresExpertAdvice: boolean;
}

export interface CorporateOfferCandidate {
  plan: CorporateSupportPlanRecord;
  sponsor: CorporateSponsorRecord;
  matchedReasons: readonly string[];
}

export interface CorporateEvaluationInput {
  targetActorId: string;
  tags: readonly VenueTag[];
  isCertifiedOrganization: boolean;
  submittedReportCount: number;
  expertAdviceCount: number;
}

/**
 * Evaluates separated corporate support plans against a simulated organization's
 * current tags, certification status, activity reports, and expert advice records.
 */
export function evaluateCorporateSupportPlans(
  sponsors: readonly CorporateSponsorRecord[],
  plans: readonly CorporateSupportPlanRecord[],
  input: CorporateEvaluationInput
): CorporateOfferCandidate[] {
  const sponsorById = new Map(sponsors.map((s) => [s.id, s]));
  const matches: CorporateOfferCandidate[] = [];

  for (const plan of plans) {
    const sponsor = sponsorById.get(plan.sponsorId);
    if (!sponsor) continue;

    const reasons: string[] = [];

    if (plan.requiresCertifiedOrg) {
      if (!input.isCertifiedOrganization) continue;
      reasons.push('運営認証済みの市民団体条件を満たしています');
    }

    if (plan.requiredTags.length > 0) {
      const hitTags = plan.requiredTags.filter((t) => input.tags.includes(t));
      if (hitTags.length === 0) continue;
      reasons.push(`対象タグ一致（${hitTags.join('・')}）`);
    }

    if (plan.requiresActivityReport) {
      if (input.submittedReportCount < 1) continue;
      reasons.push(`活動実績の簡易レポート提出済み（${input.submittedReportCount}件）`);
    }

    if (plan.requiresExpertAdvice) {
      if (input.expertAdviceCount < 1) continue;
      reasons.push(`認証済み専門家からの技術助言記録あり（${input.expertAdviceCount}件）`);
    }

    matches.push({ plan, sponsor, matchedReasons: reasons });
  }

  return matches;
}

/** Public approval visibility switch: demo shows full process; production policy remains TBD. */
export type PublicApprovalVisibilityMode = 'full-process' | 'outcome-only';

export interface PublicApprovalProcessStep {
  id: string;
  actorAccountId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  recordedAt: string;
}

export interface PublicApprovalView {
  visibilityMode: PublicApprovalVisibilityMode;
  status: string;
  decidedAt: string | null;
  /** Populated in 'full-process' (demo); omitted/empty in 'outcome-only'. */
  processSteps: readonly PublicApprovalProcessStep[];
  notice: string;
}

export function formatPublicApprovalView(
  input: {
    status: string;
    decidedAt: string | null;
    steps: readonly PublicApprovalProcessStep[];
  },
  mode: PublicApprovalVisibilityMode
): PublicApprovalView {
  if (mode === 'outcome-only') {
    return {
      visibilityMode: 'outcome-only',
      status: input.status,
      decidedAt: input.decidedAt,
      processSteps: [],
      notice: '実運用ポリシー（結果のみ表示）に従い、審査結果のみを公開しています。詳細過程は監査ログに保管されています。'
    };
  }
  return {
    visibilityMode: 'full-process',
    status: input.status,
    decidedAt: input.decidedAt,
    processSteps: [...input.steps],
    notice: 'デモ表示モード：公的アカウントの承認・判断過程を透明性ログとして可視化しています（本番公開範囲は未確定）。'
  };
}
