import type { CollaborationStage } from './index';
import type { CaseParty } from './m1';
import { validateLocationConditionsGraph, type LocationConditionsGraph } from './location-conditions';

/** D07 permission roles; authentication providers remain outside the domain layer. */
export type PermissionRole =
  | 'catalog-reader'
  | 'catalog-curator'
  | 'simulation-editor'
  | 'reviewer'
  | 'auditor';

export type PermissionScope = { kind: 'global' } | { kind: 'case'; caseId: string };

export interface PermissionGrant {
  role: PermissionRole;
  scope: PermissionScope;
  revokedAt: string | null;
  expiresAt: string | null;
}

/** Server-verified authentication context. Never trust client-supplied reviewerId or role. */
export type ServerAuthContext =
  | { authenticated: false }
  | {
      authenticated: true;
      userAccountId: string;
      grants: readonly PermissionGrant[];
      /** Simulation actor IDs operated by this user account (used for self-review prevention). */
      operatedActorIds: readonly string[];
      issuedAt: string;
    };

/** Append-only AI recommendation record (separate from human ReviewRecord; never implies approval). */
export interface AIRecommendationRecord {
  id: string;
  caseId: string;
  caseRevision: number;
  model: string;
  promptVersion: string;
  rationale: string;
  constraints: readonly string[];
  generatedAt: string;
  status: 'requires-human-review';
}

/** Append-only human review record bound to a specific case revision (D06). */
export interface ReviewRecord {
  id: string;
  caseId: string;
  caseRevision: number;
  aiRecommendationId: string | null;
  aiRecommendationVersion: string | null;
  reviewerAccountId: string;
  permissionScope: string;
  decision: 'approved' | 'rejected';
  reason: string;
  reviewedAt: string;
  policyVersion: string;
}

/** Tracks creator and latest material editor for ADR 0002 self-review prohibition. */
export interface CaseGovernanceRecord {
  caseId: string;
  createdByAccountId: string;
  lastMaterialChangeByAccountId: string | null;
  lastMaterialChangeRevision: number;
}

export type AuditScalar = string | number | boolean | null;

/** Append-only, secret-free audit event (D06). */
export interface AuditEvent {
  id: string;
  operationId: string;
  actorAccountId: string | null;
  action: 'case.review' | 'case.material-change' | 'case.transition' | 'audit.read' | 'catalog.curate';
  targetId: string;
  targetRevision: number | null;
  outcome: 'allowed' | 'denied';
  reasonCode: string;
  occurredAt: string;
  correlationId: string;
  diffSummary: Readonly<Record<string, AuditScalar>>;
}

/** D06 application DB role privilege contract: history tables are append-only (no UPDATE/DELETE). */
export const APP_ROLE_HISTORY_PRIVILEGES = Object.freeze({
  review_record: Object.freeze({ select: true, insert: true, update: false, delete: false }),
  audit_event: Object.freeze({ select: true, insert: true, update: false, delete: false })
});

export interface GovernedDomainState {
  graph: LocationConditionsGraph;
  caseGovernance: readonly CaseGovernanceRecord[];
  aiRecommendations: readonly AIRecommendationRecord[];
  reviewRecords: readonly ReviewRecord[];
  auditEvents: readonly AuditEvent[];
  processedOperationIds: readonly string[];
}

export interface ReviewSubmissionInput {
  operationId: string;
  correlationId: string;
  caseId: string;
  expectedVersion: number;
  decision: 'approved' | 'rejected';
  reason: string;
  policyVersion: string;
  aiRecommendationId?: string | null;
}

export type MaterialChangeKind =
  | 'parties'
  | 'participation-condition'
  | 'resource-requirement'
  | 'activity-reference'
  | 'unknown';

export interface MaterialCaseChangeInput {
  operationId: string;
  correlationId: string;
  caseId: string;
  expectedVersion: number;
  changeKind: MaterialChangeKind;
  changeSummary: string;
  nextParties?: readonly CaseParty[];
  nextActivity?: { id: string; domain: 'public-catalog' | 'simulation'; revision: number };
}

export interface CaseTransitionInput {
  operationId: string;
  correlationId: string;
  caseId: string;
  expectedVersion: number;
  targetStage: CollaborationStage;
}

export type CommandResult =
  | {
      ok: true;
      idempotentReplay: boolean;
      state: GovernedDomainState;
      auditEvent: AuditEvent;
    }
  | {
      ok: false;
      reasonCode: string;
      message: string;
      deniedAuditEvent: AuditEvent;
    };

const NEXT_STAGE: Partial<Record<CollaborationStage, CollaborationStage>> = {
  draft: 'requested',
  requested: 'coordinating',
  coordinating: 'agreed',
  agreed: 'preparing'
};

const UNTRUSTED_CLIENT_FIELDS = ['reviewerId', 'role', 'roles', 'permissions', 'userAccountId', 'grants'] as const;
const FORBIDDEN_AUDIT_KEY_PATTERN = /(password|secret|token|cookie|authorization|database_url|credential|email|phone|address)/i;
const FORBIDDEN_AUDIT_VALUE_PATTERN = /(postgresql:\/\/|postgres:\/\/|Bearer\s+\S+|ghp_|github_pat_)/i;

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function text(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateIsoTimestamp(v: string, label: string) {
  check(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)),
    `Invalid ${label}`
  );
}

/** Strips sensitive keys and verifies no credential/connection-string leaks into AuditEvent. */
export function sanitizeAuditDiffSummary(
  raw: Record<string, unknown>
): Readonly<Record<string, AuditScalar>> {
  const clean: Record<string, AuditScalar> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (FORBIDDEN_AUDIT_KEY_PATTERN.test(k)) continue;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') {
      clean[k] = v;
    } else if (typeof v === 'string') {
      clean[k] = FORBIDDEN_AUDIT_VALUE_PATTERN.test(v) ? '[REDACTED]' : v;
    }
  }
  return clean;
}

/** Validates that an AuditEvent contains no forbidden secret keys or connection-string values. */
export function assertAuditEventSanitized(event: AuditEvent): void {
  check(text(event.id) && text(event.operationId) && text(event.correlationId), 'Invalid audit identifiers');
  validateIsoTimestamp(event.occurredAt, 'audit occurredAt');
  for (const [k, v] of Object.entries(event.diffSummary)) {
    check(!FORBIDDEN_AUDIT_KEY_PATTERN.test(k), `Forbidden audit key: ${k}`);
    if (typeof v === 'string') {
      check(!FORBIDDEN_AUDIT_VALUE_PATTERN.test(v), `Forbidden audit value in key: ${k}`);
    }
  }
}

function hasUntrustedClientIdentityFields(input: object): boolean {
  return UNTRUSTED_CLIENT_FIELDS.some((k) => k in input);
}

function formatScope(scope: PermissionScope): string {
  return scope.kind === 'global' ? 'global' : `case:${scope.caseId}`;
}

/** Checks server-side role & scope authorization (never infers from ActorMembership). */
export function authorizeServerAction(
  auth: ServerAuthContext,
  requiredRole: PermissionRole,
  targetCaseId: string | null,
  serverNowIso: string
): { allowed: true; matchedScope: string } | { allowed: false; reasonCode: string; message: string } {
  validateIsoTimestamp(serverNowIso, 'serverNowIso');
  if (!auth.authenticated) {
    return { allowed: false, reasonCode: 'UNAUTHENTICATED', message: 'Authentication required' };
  }
  if (!text(auth.userAccountId)) {
    return { allowed: false, reasonCode: 'UNAUTHENTICATED', message: 'Missing server userAccountId' };
  }
  const nowMs = Date.parse(serverNowIso);
  for (const grant of auth.grants) {
    if (grant.role !== requiredRole) continue;
    if (grant.revokedAt !== null && Date.parse(grant.revokedAt) <= nowMs) continue;
    if (grant.expiresAt !== null && Date.parse(grant.expiresAt) <= nowMs) continue;
    if (grant.scope.kind === 'global') {
      return { allowed: true, matchedScope: formatScope(grant.scope) };
    }
    if (targetCaseId !== null && grant.scope.kind === 'case' && grant.scope.caseId === targetCaseId) {
      return { allowed: true, matchedScope: formatScope(grant.scope) };
    }
  }
  return {
    allowed: false,
    reasonCode: 'FORBIDDEN_SCOPE_OR_ROLE',
    message: `Missing active ${requiredRole} grant for target scope`
  };
}

function makeAudit(params: {
  state: GovernedDomainState;
  operationId: string;
  correlationId: string;
  auth: ServerAuthContext;
  action: AuditEvent['action'];
  targetId: string;
  targetRevision: number | null;
  outcome: 'allowed' | 'denied';
  reasonCode: string;
  occurredAt: string;
  diffSummary: Record<string, unknown>;
}): AuditEvent {
  const event: AuditEvent = {
    id: `audit-${params.state.auditEvents.length + 1}-${params.operationId}`,
    operationId: params.operationId,
    actorAccountId: params.auth.authenticated ? params.auth.userAccountId : null,
    action: params.action,
    targetId: params.targetId,
    targetRevision: params.targetRevision,
    outcome: params.outcome,
    reasonCode: params.reasonCode,
    occurredAt: params.occurredAt,
    correlationId: params.correlationId,
    diffSummary: sanitizeAuditDiffSummary(params.diffSummary)
  };
  assertAuditEventSanitized(event);
  return event;
}

/** Validates governed state invariants including append-only reviews and sanitized audits. */
export function validateGovernedDomainState(state: GovernedDomainState): void {
  validateLocationConditionsGraph(state.graph);
  const caseIds = new Set(state.graph.cases.map((c) => c.id));
  const govIds = new Set<string>();
  for (const g of state.caseGovernance) {
    check(caseIds.has(g.caseId) && !govIds.has(g.caseId), 'Invalid or duplicate case governance');
    govIds.add(g.caseId);
    check(text(g.createdByAccountId), 'Missing createdByAccountId');
    check(Number.isSafeInteger(g.lastMaterialChangeRevision) && g.lastMaterialChangeRevision > 0, 'Invalid governance revision');
  }
  const recIds = new Set<string>();
  for (const rec of state.aiRecommendations) {
    check(text(rec.id) && !recIds.has(rec.id), 'Invalid AIRecommendation ID');
    recIds.add(rec.id);
    check(caseIds.has(rec.caseId) && rec.status === 'requires-human-review', 'Invalid AIRecommendation');
    check(text(rec.model) && text(rec.promptVersion) && text(rec.rationale), 'Incomplete AIRecommendation');
    validateIsoTimestamp(rec.generatedAt, 'AIRecommendation generatedAt');
  }
  const revIds = new Set<string>();
  for (const rev of state.reviewRecords) {
    check(text(rev.id) && !revIds.has(rev.id), 'Invalid ReviewRecord ID');
    revIds.add(rev.id);
    check(caseIds.has(rev.caseId), 'Unknown case in ReviewRecord');
    check(text(rev.reviewerAccountId) && text(rev.reason) && text(rev.policyVersion), 'Incomplete ReviewRecord');
    check(rev.decision === 'approved' || rev.decision === 'rejected', 'Invalid review decision');
    validateIsoTimestamp(rev.reviewedAt, 'ReviewRecord reviewedAt');
  }
  const auditIds = new Set<string>();
  for (const ev of state.auditEvents) {
    check(!auditIds.has(ev.id), 'Duplicate AuditEvent ID');
    auditIds.add(ev.id);
    assertAuditEventSanitized(ev);
  }
}

/**
 * Appends a human ReviewRecord (approved or rejected) bound to the current case revision.
 * Rejects unauthenticated/out-of-scope callers, untrusted client identity fields, and self-review.
 */
export function recordHumanReview(
  state: GovernedDomainState,
  auth: ServerAuthContext,
  input: ReviewSubmissionInput,
  serverNowIso: string
): CommandResult {
  validateGovernedDomainState(state);
  validateIsoTimestamp(serverNowIso, 'serverNowIso');

  const deny = (reasonCode: string, message: string, targetRev: number | null = null): CommandResult => ({
    ok: false,
    reasonCode,
    message,
    deniedAuditEvent: makeAudit({
      state,
      operationId: text(input.operationId) ? input.operationId : 'invalid-op',
      correlationId: text(input.correlationId) ? input.correlationId : 'invalid-corr',
      auth,
      action: 'case.review',
      targetId: input.caseId,
      targetRevision: targetRev,
      outcome: 'denied',
      reasonCode,
      occurredAt: serverNowIso,
      diffSummary: { decision: input.decision }
    })
  });

  if (hasUntrustedClientIdentityFields(input)) {
    return deny('UNTRUSTED_CLIENT_IDENTITY', 'Client-supplied reviewerId/role fields are forbidden');
  }
  if (!text(input.operationId) || !text(input.correlationId)) {
    return deny('INVALID_OPERATION_METADATA', 'operationId and correlationId are required');
  }

  // Idempotent replay check
  if (state.processedOperationIds.includes(input.operationId)) {
    const existing = state.auditEvents.find((e) => e.operationId === input.operationId && e.outcome === 'allowed');
    if (existing) {
      return { ok: true, idempotentReplay: true, state: structuredClone(state), auditEvent: structuredClone(existing) };
    }
  }

  const authz = authorizeServerAction(auth, 'reviewer', input.caseId, serverNowIso);
  if (!authz.allowed) return deny(authz.reasonCode, authz.message);

  const targetCase = state.graph.cases.find((c) => c.id === input.caseId);
  if (!targetCase) return deny('UNKNOWN_CASE', 'Case not found');
  if (targetCase.mode !== 'simulation') return deny('SIMULATION_ONLY', 'Only simulation cases can be reviewed', targetCase.revision);
  if (targetCase.revision !== input.expectedVersion) {
    return deny('VERSION_CONFLICT', 'Case version conflict', targetCase.revision);
  }

  // ADR 0002: Self-review is strictly prohibited with no M1 bypass
  const gov = state.caseGovernance.find((g) => g.caseId === input.caseId);
  if (!gov) return deny('MISSING_GOVERNANCE', 'Case governance metadata missing', targetCase.revision);
  if (
    auth.authenticated &&
    (auth.userAccountId === gov.createdByAccountId ||
      auth.userAccountId === gov.lastMaterialChangeByAccountId ||
      targetCase.parties.some((p) => auth.operatedActorIds.includes(p.actorId)))
  ) {
    return deny('SELF_REVIEW_PROHIBITED', 'Creator, material editor, or case party operator cannot review this revision', targetCase.revision);
  }

  if (!text(input.reason) || !text(input.policyVersion)) {
    return deny('INVALID_REVIEW_PAYLOAD', 'Review reason and policyVersion are required', targetCase.revision);
  }

  let aiRecVersion: string | null = null;
  if (input.aiRecommendationId) {
    const rec = state.aiRecommendations.find(
      (r) => r.id === input.aiRecommendationId && r.caseId === targetCase.id && r.caseRevision === targetCase.revision
    );
    if (!rec) return deny('UNKNOWN_AI_RECOMMENDATION', 'Referenced AIRecommendation does not match case revision', targetCase.revision);
    aiRecVersion = `${rec.model}@${rec.promptVersion}`;
  }

  const review: ReviewRecord = {
    id: `rev-${state.reviewRecords.length + 1}-${input.operationId}`,
    caseId: targetCase.id,
    caseRevision: targetCase.revision,
    aiRecommendationId: input.aiRecommendationId ?? null,
    aiRecommendationVersion: aiRecVersion,
    reviewerAccountId: auth.authenticated ? auth.userAccountId : '',
    permissionScope: authz.matchedScope,
    decision: input.decision,
    reason: input.reason.trim(),
    reviewedAt: serverNowIso,
    policyVersion: input.policyVersion.trim()
  };

  const auditEvent = makeAudit({
    state,
    operationId: input.operationId,
    correlationId: input.correlationId,
    auth,
    action: 'case.review',
    targetId: targetCase.id,
    targetRevision: targetCase.revision,
    outcome: 'allowed',
    reasonCode: input.decision === 'approved' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED',
    occurredAt: serverNowIso,
    diffSummary: {
      decision: input.decision,
      caseRevision: targetCase.revision,
      policyVersion: review.policyVersion
    }
  });

  const nextState: GovernedDomainState = structuredClone({
    ...state,
    reviewRecords: [...state.reviewRecords, review],
    auditEvents: [...state.auditEvents, auditEvent],
    processedOperationIds: [...state.processedOperationIds, input.operationId]
  });
  validateGovernedDomainState(nextState);
  return { ok: true, idempotentReplay: false, state: nextState, auditEvent };
}

/**
 * Applies a material (or unknown-classification) change to a case, incrementing case.revision
 * so any approval bound to the previous revision can no longer be reused (D06 / ADR 0002).
 */
export function applyMaterialCaseChange(
  state: GovernedDomainState,
  auth: ServerAuthContext,
  input: MaterialCaseChangeInput,
  serverNowIso: string
): CommandResult {
  validateGovernedDomainState(state);
  validateIsoTimestamp(serverNowIso, 'serverNowIso');

  const deny = (reasonCode: string, message: string, targetRev: number | null = null): CommandResult => ({
    ok: false,
    reasonCode,
    message,
    deniedAuditEvent: makeAudit({
      state,
      operationId: text(input.operationId) ? input.operationId : 'invalid-op',
      correlationId: text(input.correlationId) ? input.correlationId : 'invalid-corr',
      auth,
      action: 'case.material-change',
      targetId: input.caseId,
      targetRevision: targetRev,
      outcome: 'denied',
      reasonCode,
      occurredAt: serverNowIso,
      diffSummary: { changeKind: input.changeKind }
    })
  });

  if (hasUntrustedClientIdentityFields(input)) {
    return deny('UNTRUSTED_CLIENT_IDENTITY', 'Client-supplied identity/role fields are forbidden');
  }
  if (!text(input.operationId) || !text(input.correlationId) || !text(input.changeSummary)) {
    return deny('INVALID_CHANGE_PAYLOAD', 'operationId, correlationId, and changeSummary are required');
  }

  if (state.processedOperationIds.includes(input.operationId)) {
    const existing = state.auditEvents.find((e) => e.operationId === input.operationId && e.outcome === 'allowed');
    if (existing) {
      return { ok: true, idempotentReplay: true, state: structuredClone(state), auditEvent: structuredClone(existing) };
    }
  }

  const authz = authorizeServerAction(auth, 'simulation-editor', input.caseId, serverNowIso);
  if (!authz.allowed) return deny(authz.reasonCode, authz.message);

  const targetCase = state.graph.cases.find((c) => c.id === input.caseId);
  if (!targetCase) return deny('UNKNOWN_CASE', 'Case not found');
  if (targetCase.revision !== input.expectedVersion) {
    return deny('VERSION_CONFLICT', 'Case version conflict', targetCase.revision);
  }

  const nextRevision = targetCase.revision + 1;
  const updatedCase = {
    ...targetCase,
    revision: nextRevision,
    parties: input.nextParties ? input.nextParties.map((p) => ({ ...p })) : targetCase.parties,
    activity: input.nextActivity ? { ...input.nextActivity } : targetCase.activity
  };

  // Update case-owned needs/resourceRequirements to keep case revision references consistent when needed
  const updatedGraph: LocationConditionsGraph = {
    ...state.graph,
    cases: state.graph.cases.map((c) => (c.id === targetCase.id ? updatedCase : c))
  };

  try {
    validateLocationConditionsGraph(updatedGraph);
  } catch (err) {
    return deny('INVALID_DOMAIN_GRAPH', err instanceof Error ? err.message : 'Domain validation failed', targetCase.revision);
  }

  const updatedGovernance = state.caseGovernance.map((g) =>
    g.caseId === targetCase.id
      ? {
          ...g,
          lastMaterialChangeByAccountId: auth.authenticated ? auth.userAccountId : null,
          lastMaterialChangeRevision: nextRevision
        }
      : g
  );

  const auditEvent = makeAudit({
    state,
    operationId: input.operationId,
    correlationId: input.correlationId,
    auth,
    action: 'case.material-change',
    targetId: targetCase.id,
    targetRevision: nextRevision,
    outcome: 'allowed',
    reasonCode: input.changeKind === 'unknown' ? 'UNKNOWN_CHANGE_REQUIRES_REREVIEW' : 'MATERIAL_CHANGE_REQUIRES_REREVIEW',
    occurredAt: serverNowIso,
    diffSummary: {
      changeKind: input.changeKind,
      fromRevision: targetCase.revision,
      toRevision: nextRevision
    }
  });

  const nextState: GovernedDomainState = structuredClone({
    ...state,
    graph: updatedGraph,
    caseGovernance: updatedGovernance,
    auditEvents: [...state.auditEvents, auditEvent],
    processedOperationIds: [...state.processedOperationIds, input.operationId]
  });
  validateGovernedDomainState(nextState);
  return { ok: true, idempotentReplay: false, state: nextState, auditEvent };
}

/**
 * Advances a simulation case stage strictly sequentially (M0 stages preserved)
 * only when the latest ReviewRecord for the CURRENT case.revision is 'approved'.
 */
export function transitionSimulationCase(
  state: GovernedDomainState,
  auth: ServerAuthContext,
  input: CaseTransitionInput,
  serverNowIso: string
): CommandResult {
  validateGovernedDomainState(state);
  validateIsoTimestamp(serverNowIso, 'serverNowIso');

  const deny = (reasonCode: string, message: string, targetRev: number | null = null): CommandResult => ({
    ok: false,
    reasonCode,
    message,
    deniedAuditEvent: makeAudit({
      state,
      operationId: text(input.operationId) ? input.operationId : 'invalid-op',
      correlationId: text(input.correlationId) ? input.correlationId : 'invalid-corr',
      auth,
      action: 'case.transition',
      targetId: input.caseId,
      targetRevision: targetRev,
      outcome: 'denied',
      reasonCode,
      occurredAt: serverNowIso,
      diffSummary: { targetStage: input.targetStage }
    })
  });

  if (hasUntrustedClientIdentityFields(input)) {
    return deny('UNTRUSTED_CLIENT_IDENTITY', 'Client-supplied identity/role fields are forbidden');
  }
  if (!text(input.operationId) || !text(input.correlationId)) {
    return deny('INVALID_OPERATION_METADATA', 'operationId and correlationId are required');
  }

  if (state.processedOperationIds.includes(input.operationId)) {
    const existing = state.auditEvents.find((e) => e.operationId === input.operationId && e.outcome === 'allowed');
    if (existing) {
      return { ok: true, idempotentReplay: true, state: structuredClone(state), auditEvent: structuredClone(existing) };
    }
  }

  const authz = authorizeServerAction(auth, 'simulation-editor', input.caseId, serverNowIso);
  if (!authz.allowed) return deny(authz.reasonCode, authz.message);

  const targetCase = state.graph.cases.find((c) => c.id === input.caseId);
  if (!targetCase) return deny('UNKNOWN_CASE', 'Case not found');
  if (targetCase.mode !== 'simulation') return deny('SIMULATION_ONLY', 'Simulation mode only', targetCase.revision);
  if (targetCase.revision !== input.expectedVersion) {
    return deny('VERSION_CONFLICT', 'Case version conflict', targetCase.revision);
  }
  if (NEXT_STAGE[targetCase.stage] !== input.targetStage) {
    return deny('INVALID_STAGE_TRANSITION', `Cannot transition from ${targetCase.stage} to ${input.targetStage}`, targetCase.revision);
  }

  // Require an active human approval bound to THIS exact case.revision (never reuse prior revision approval or AI recommendation)
  const reviewsForRevision = state.reviewRecords.filter(
    (r) => r.caseId === targetCase.id && r.caseRevision === targetCase.revision
  );
  const latestReview = reviewsForRevision[reviewsForRevision.length - 1];
  if (!latestReview || latestReview.decision !== 'approved') {
    return deny(
      'HUMAN_APPROVAL_REQUIRED',
      'Active human approval bound to the current case revision is required',
      targetCase.revision
    );
  }

  const updatedCase = { ...targetCase, stage: input.targetStage };
  const auditEvent = makeAudit({
    state,
    operationId: input.operationId,
    correlationId: input.correlationId,
    auth,
    action: 'case.transition',
    targetId: targetCase.id,
    targetRevision: targetCase.revision,
    outcome: 'allowed',
    reasonCode: 'STAGE_TRANSITIONED',
    occurredAt: serverNowIso,
    diffSummary: {
      mode: 'simulation',
      fromStage: targetCase.stage,
      toStage: input.targetStage,
      approvalReviewId: latestReview.id
    }
  });

  const nextState: GovernedDomainState = structuredClone({
    ...state,
    graph: {
      ...state.graph,
      cases: state.graph.cases.map((c) => (c.id === targetCase.id ? updatedCase : c))
    },
    auditEvents: [...state.auditEvents, auditEvent],
    processedOperationIds: [...state.processedOperationIds, input.operationId]
  });
  validateGovernedDomainState(nextState);
  return { ok: true, idempotentReplay: false, state: nextState, auditEvent };
}

/** Repository transaction contract enforcing atomic business+audit commit and separate denied-audit persistence. */
export interface AtomicAuditStorePort {
  runTransaction<T>(fn: (tx: { saveBusinessState(state: GovernedDomainState): Promise<void>; appendAuditEvent(event: AuditEvent): Promise<void> }) => Promise<T>): Promise<T>;
  persistDeniedAudit(event: AuditEvent): Promise<void>;
}

/**
 * Executes a governed domain command against a transactional store port:
 * - Denied commands leave business state untouched and persist deniedAuditEvent separately.
 * - Allowed commands persist business state + audit event in one transaction; audit failure rolls back business state.
 */
export async function executeWithAtomicAudit(
  store: AtomicAuditStorePort,
  commandResult: CommandResult
): Promise<CommandResult> {
  if (!commandResult.ok) {
    await store.persistDeniedAudit(commandResult.deniedAuditEvent);
    return commandResult;
  }
  if (commandResult.idempotentReplay) {
    return commandResult;
  }
  await store.runTransaction(async (tx) => {
    await tx.saveBusinessState(commandResult.state);
    await tx.appendAuditEvent(commandResult.auditEvent);
  });
  return commandResult;
}
