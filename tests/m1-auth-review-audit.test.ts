import { describe, expect, it } from 'vitest';
import type { Actor } from '../packages/domain/src/m1';
import type { SourceDocument } from '../packages/domain/src/provenance';
import type { LocationConditionsGraph } from '../packages/domain/src/location-conditions';
import {
  APP_ROLE_HISTORY_PRIVILEGES,
  applyMaterialCaseChange,
  assertAuditEventSanitized,
  authorizeServerAction,
  executeWithAtomicAudit,
  recordHumanReview,
  sanitizeAuditDiffSummary,
  transitionSimulationCase,
  type AtomicAuditStorePort,
  type AuditEvent,
  type GovernedDomainState,
  type ServerAuthContext
} from '../packages/domain/src/auth-review-audit';

const NOW = '2026-11-25T04:00:00Z';

const makeSource = (): SourceDocument => ({
  id: 'src-1',
  url: 'https://example.invalid/auth-test',
  publisher: '架空テスト発行者',
  title: 'テスト出典',
  accessedOn: '2026-11-25',
  publishedOn: null,
  updatedOn: null,
  summary: 'テスト専用出典',
  urlStatus: 'unchecked',
  usage: { status: 'unchecked', evidence: null }
});

const simActor1: Actor = { id: 'sim-p1', domain: 'simulation', kind: 'person', displayName: '架空個人1', expertise: [] };
const simActor2: Actor = { id: 'sim-p2', domain: 'simulation', kind: 'person', displayName: '架空個人2', expertise: [] };

const makeBaseGraph = (): LocationConditionsGraph => ({
  actors: [simActor1, simActor2],
  actorRevisions: [
    { actor: simActor1, revision: 1 },
    { actor: simActor2, revision: 1 }
  ],
  actorAssertions: [],
  memberships: [],
  activities: [{ id: 'act-pub', domain: 'public-catalog', revision: 1, title: '公開テスト活動' }],
  activityRevisions: [{ id: 'act-pub', domain: 'public-catalog', revision: 1, title: '公開テスト活動' }],
  activityParties: [],
  cases: [
    {
      mode: 'simulation',
      id: 'case-1',
      activity: { id: 'act-pub', domain: 'public-catalog', revision: 1 },
      revision: 1,
      stage: 'draft',
      parties: [{ actorId: simActor1.id, role: 'candidate' }]
    }
  ],
  interests: [],
  needs: [],
  sources: [makeSource()],
  assertions: [
    {
      id: 'asrt-1',
      target: { activityId: 'act-pub', revision: 1, field: 'title' },
      sourceId: 'src-1',
      value: '公開テスト活動',
      status: 'unverified',
      checkedBy: null,
      checkedAt: null
    }
  ],
  locations: [],
  participationConditions: [],
  resourceRequirements: [],
  actorSkills: []
});

const makeState = (): GovernedDomainState => ({
  graph: makeBaseGraph(),
  caseGovernance: [
    {
      caseId: 'case-1',
      createdByAccountId: 'acct-creator',
      lastMaterialChangeByAccountId: null,
      lastMaterialChangeRevision: 1
    }
  ],
  aiRecommendations: [
    {
      id: 'ai-rec-1',
      caseId: 'case-1',
      caseRevision: 1,
      model: 'fixture-only',
      promptVersion: 'v0.1',
      rationale: '模擬一次推薦（テスト）',
      constraints: ['人間二次審査が必要'],
      generatedAt: '2026-11-25T03:00:00Z',
      status: 'requires-human-review'
    }
  ],
  reviewRecords: [],
  auditEvents: [],
  processedOperationIds: []
});

const editorAuth: ServerAuthContext = {
  authenticated: true,
  userAccountId: 'acct-creator',
  grants: [{ role: 'simulation-editor', scope: { kind: 'case', caseId: 'case-1' }, revokedAt: null, expiresAt: null }],
  operatedActorIds: [simActor1.id],
  issuedAt: '2026-11-25T03:00:00Z'
};

const independentReviewerAuth: ServerAuthContext = {
  authenticated: true,
  userAccountId: 'acct-reviewer-indep',
  grants: [{ role: 'reviewer', scope: { kind: 'case', caseId: 'case-1' }, revokedAt: null, expiresAt: null }],
  operatedActorIds: [],
  issuedAt: '2026-11-25T03:00:00Z'
};

describe('M1-05 (#7) Server authorization, untrusted client rejection, and self-review prohibition', () => {
  it('denies unauthenticated, expired, revoked, out-of-scope grants and untrusted client reviewerId/role fields', () => {
    const state = makeState();

    // Unauthenticated
    const unauth = recordHumanReview(
      state,
      { authenticated: false },
      { operationId: 'op-1', correlationId: 'c-1', caseId: 'case-1', expectedVersion: 1, decision: 'approved', reason: 'ok', policyVersion: 'p1' },
      NOW
    );
    expect(unauth.ok).toBe(false);
    if (!unauth.ok) {
      expect(unauth.reasonCode).toBe('UNAUTHENTICATED');
      expect(unauth.deniedAuditEvent.outcome).toBe('denied');
    }

    // Revoked grant & expired grant & out-of-scope case grant
    expect(
      authorizeServerAction(
        {
          ...independentReviewerAuth,
          grants: [{ role: 'reviewer', scope: { kind: 'case', caseId: 'case-1' }, revokedAt: '2026-11-25T03:30:00Z', expiresAt: null }]
        },
        'reviewer',
        'case-1',
        NOW
      ).allowed
    ).toBe(false);
    expect(
      authorizeServerAction(
        {
          ...independentReviewerAuth,
          grants: [{ role: 'reviewer', scope: { kind: 'case', caseId: 'case-1' }, revokedAt: null, expiresAt: '2026-11-25T03:59:59Z' }]
        },
        'reviewer',
        'case-1',
        NOW
      ).allowed
    ).toBe(false);
    expect(
      authorizeServerAction(
        {
          ...independentReviewerAuth,
          grants: [{ role: 'reviewer', scope: { kind: 'case', caseId: 'case-other' }, revokedAt: null, expiresAt: null }]
        },
        'reviewer',
        'case-1',
        NOW
      ).allowed
    ).toBe(false);

    // Client-injected reviewerId or role rejected even with valid server auth
    const spoofed = recordHumanReview(
      state,
      independentReviewerAuth,
      {
        operationId: 'op-spoof',
        correlationId: 'c-2',
        caseId: 'case-1',
        expectedVersion: 1,
        decision: 'approved',
        reason: 'spoof attempt',
        policyVersion: 'p1',
        reviewerId: 'fake-admin',
        role: 'reviewer'
      } as unknown as Parameters<typeof recordHumanReview>[2],
      NOW
    );
    expect(spoofed.ok).toBe(false);
    if (!spoofed.ok) {
      expect(spoofed.reasonCode).toBe('UNTRUSTED_CLIENT_IDENTITY');
      expect(spoofed.deniedAuditEvent.outcome).toBe('denied');
    }
  });

  it('prohibits self-review by creator, material editor, or case party operator', () => {
    const state = makeState();

    // Case creator with reviewer grant still cannot review
    const creatorReviewer: ServerAuthContext = {
      authenticated: true,
      userAccountId: 'acct-creator',
      grants: [{ role: 'reviewer', scope: { kind: 'global' }, revokedAt: null, expiresAt: null }],
      operatedActorIds: [],
      issuedAt: '2026-11-25T03:00:00Z'
    };
    const r1 = recordHumanReview(
      state,
      creatorReviewer,
      { operationId: 'op-self-1', correlationId: 'c-s1', caseId: 'case-1', expectedVersion: 1, decision: 'approved', reason: 'self', policyVersion: 'p1' },
      NOW
    );
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reasonCode).toBe('SELF_REVIEW_PROHIBITED');

    // Account operating a CaseParty actor cannot review
    const partyOperatorReviewer: ServerAuthContext = {
      authenticated: true,
      userAccountId: 'acct-party-op',
      grants: [{ role: 'reviewer', scope: { kind: 'global' }, revokedAt: null, expiresAt: null }],
      operatedActorIds: [simActor1.id],
      issuedAt: '2026-11-25T03:00:00Z'
    };
    const r2 = recordHumanReview(
      state,
      partyOperatorReviewer,
      { operationId: 'op-self-2', correlationId: 'c-s2', caseId: 'case-1', expectedVersion: 1, decision: 'approved', reason: 'party', policyVersion: 'p1' },
      NOW
    );
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reasonCode).toBe('SELF_REVIEW_PROHIBITED');
  });

  it('requires an AI primary recommendation for the current revision before any human review (requirement 4)', () => {
    const noAiState = { ...makeState(), aiRecommendations: [] };
    for (const decision of ['approved', 'rejected'] as const) {
      const res = recordHumanReview(
        noAiState,
        independentReviewerAuth,
        { operationId: `op-noai-${decision}`, correlationId: 'c-noai', caseId: 'case-1', expectedVersion: 1, decision, reason: 'AIなし', policyVersion: 'p1' },
        NOW
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reasonCode).toBe('AI_RECOMMENDATION_REQUIRED');
        expect(res.deniedAuditEvent.outcome).toBe('denied');
      }
    }
    // Referencing an AI recommendation from another revision is rejected too
    const stale = recordHumanReview(
      makeState(),
      independentReviewerAuth,
      { operationId: 'op-noai-stale', correlationId: 'c-noai2', caseId: 'case-1', expectedVersion: 1, decision: 'approved', reason: '別rev参照', policyVersion: 'p1', aiRecommendationId: 'ai-rec-missing' },
      NOW
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.reasonCode).toBe('UNKNOWN_AI_RECOMMENDATION');
  });
});

describe('M1-05 (#7) Append-only reviews, approval invalidation after material change, sequential stages, and idempotency', () => {
  it('appends rejection and re-review, blocks transition without current-revision approval, and invalidates approval after material or unknown change', () => {
    let state = makeState();

    // 1) AIRecommendation alone cannot advance draft -> requested
    const noHuman = transitionSimulationCase(
      state,
      editorAuth,
      { operationId: 'op-tr-0', correlationId: 'c-0', caseId: 'case-1', expectedVersion: 1, targetStage: 'requested' },
      NOW
    );
    expect(noHuman.ok).toBe(false);
    if (!noHuman.ok) expect(noHuman.reasonCode).toBe('HUMAN_APPROVAL_REQUIRED');

    // 2) First review rejects (appended)
    const rej = recordHumanReview(
      state,
      independentReviewerAuth,
      {
        operationId: 'op-rev-1',
        correlationId: 'c-r1',
        caseId: 'case-1',
        expectedVersion: 1,
        decision: 'rejected',
        reason: '確認事項が未整理',
        policyVersion: 'policy-v1',
        aiRecommendationId: 'ai-rec-1'
      },
      NOW
    );
    expect(rej.ok).toBe(true);
    if (!rej.ok) throw new Error('expected ok');
    state = rej.state;
    expect(state.reviewRecords).toHaveLength(1);

    // Transition remains blocked after rejection
    const afterRej = transitionSimulationCase(
      state,
      editorAuth,
      { operationId: 'op-tr-rej', correlationId: 'c-tr-rej', caseId: 'case-1', expectedVersion: 1, targetStage: 'requested' },
      NOW
    );
    expect(afterRej.ok).toBe(false);

    // 3) Re-review approves rev 1 (appended; rejection preserved!)
    const app1 = recordHumanReview(
      state,
      independentReviewerAuth,
      {
        operationId: 'op-rev-2',
        correlationId: 'c-r2',
        caseId: 'case-1',
        expectedVersion: 1,
        decision: 'approved',
        reason: '確認事項を整理済み',
        policyVersion: 'policy-v1',
        aiRecommendationId: 'ai-rec-1'
      },
      '2026-11-25T04:05:00Z'
    );
    expect(app1.ok).toBe(true);
    if (!app1.ok) throw new Error('expected ok');
    state = app1.state;
    expect(state.reviewRecords).toHaveLength(2);
    expect(state.reviewRecords.map((r) => r.decision)).toEqual(['rejected', 'approved']);

    // 4) Skipping stages (draft -> agreed) is rejected even when approved
    const skipStage = transitionSimulationCase(
      state,
      editorAuth,
      { operationId: 'op-skip', correlationId: 'c-skip', caseId: 'case-1', expectedVersion: 1, targetStage: 'agreed' },
      '2026-11-25T04:06:00Z'
    );
    expect(skipStage.ok).toBe(false);
    if (!skipStage.ok) expect(skipStage.reasonCode).toBe('INVALID_STAGE_TRANSITION');

    // 5) Material change (adding party) increments case.revision to 2 and invalidates rev 1 approval
    const mat = applyMaterialCaseChange(
      state,
      editorAuth,
      {
        operationId: 'op-mat-1',
        correlationId: 'c-m1',
        caseId: 'case-1',
        expectedVersion: 1,
        changeKind: 'parties',
        changeSummary: '当事者追加',
        nextParties: [
          { actorId: simActor1.id, role: 'candidate' },
          { actorId: simActor2.id, role: 'candidate' }
        ]
      },
      '2026-11-25T04:10:00Z'
    );
    expect(mat.ok).toBe(true);
    if (!mat.ok) throw new Error('expected ok');
    state = mat.state;
    expect(state.graph.cases[0].revision).toBe(2);

    // Old expectedVersion=1 rejected as VERSION_CONFLICT
    const staleVer = transitionSimulationCase(
      state,
      editorAuth,
      { operationId: 'op-stale', correlationId: 'c-stale', caseId: 'case-1', expectedVersion: 1, targetStage: 'requested' },
      '2026-11-25T04:11:00Z'
    );
    expect(staleVer.ok).toBe(false);
    if (!staleVer.ok) expect(staleVer.reasonCode).toBe('VERSION_CONFLICT');

    // Using new expectedVersion=2 without re-review on rev 2 is STILL rejected!
    const oldApprovalReuse = transitionSimulationCase(
      state,
      editorAuth,
      { operationId: 'op-reuse', correlationId: 'c-reuse', caseId: 'case-1', expectedVersion: 2, targetStage: 'requested' },
      '2026-11-25T04:12:00Z'
    );
    expect(oldApprovalReuse.ok).toBe(false);
    if (!oldApprovalReuse.ok) expect(oldApprovalReuse.reasonCode).toBe('HUMAN_APPROVAL_REQUIRED');

    // 6) Approve rev 2 -> sequential transition draft -> requested succeeds + idempotent replay does not duplicate
    state = {
      ...state,
      aiRecommendations: [
        ...state.aiRecommendations,
        { ...state.aiRecommendations[0], id: 'ai-rec-2', caseRevision: 2, generatedAt: '2026-11-25T04:14:00Z' }
      ]
    };
    const app2 = recordHumanReview(
      state,
      independentReviewerAuth,
      {
        operationId: 'op-rev-3',
        correlationId: 'c-r3',
        caseId: 'case-1',
        expectedVersion: 2,
        decision: 'approved',
        reason: '当事者追加後を再確認',
        policyVersion: 'policy-v1',
        aiRecommendationId: 'ai-rec-2'
      },
      '2026-11-25T04:15:00Z'
    );
    expect(app2.ok).toBe(true);
    if (!app2.ok) throw new Error('expected ok');
    state = app2.state;

    const tr1 = transitionSimulationCase(
      state,
      editorAuth,
      { operationId: 'op-tr-1', correlationId: 'c-t1', caseId: 'case-1', expectedVersion: 2, targetStage: 'requested' },
      '2026-11-25T04:16:00Z'
    );
    expect(tr1.ok).toBe(true);
    if (!tr1.ok) throw new Error('expected ok');
    state = tr1.state;
    expect(state.graph.cases[0].stage).toBe('requested');

    // Idempotent replay with same operationId
    const replay = transitionSimulationCase(
      state,
      editorAuth,
      { operationId: 'op-tr-1', correlationId: 'c-t1', caseId: 'case-1', expectedVersion: 2, targetStage: 'requested' },
      '2026-11-25T04:16:01Z'
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.idempotentReplay).toBe(true);
      expect(replay.state.auditEvents.length).toBe(state.auditEvents.length);
    }

    // Unknown change classification falls back to re-review (ADR 0002)
    const unknownChange = applyMaterialCaseChange(
      state,
      editorAuth,
      {
        operationId: 'op-unk-1',
        correlationId: 'c-u1',
        caseId: 'case-1',
        expectedVersion: 2,
        changeKind: 'unknown',
        changeSummary: '重要度未分類の変更'
      },
      '2026-11-25T04:20:00Z'
    );
    expect(unknownChange.ok).toBe(true);
    if (unknownChange.ok) {
      expect(unknownChange.state.graph.cases[0].revision).toBe(3);
      expect(unknownChange.auditEvent.reasonCode).toBe('UNKNOWN_CHANGE_REQUIRES_REREVIEW');
    }
  });
});

describe('M1-05 (#7) Atomic audit rollback, denied audit persistence, append-only privileges, and secret redaction', () => {
  it('rolls back business update when audit persistence fails, persists denied audits separately, and redacts secrets', async () => {
    const initial = makeState();
    let persistedBusiness: GovernedDomainState = initial;
    const persistedAudits: AuditEvent[] = [];

    // 1) Store whose audit append throws -> business state must roll back cleanly
    const failingAuditStore: AtomicAuditStorePort = {
      async runTransaction(fn) {
        const snapshot = structuredClone(persistedBusiness);
        try {
          return await fn({
            async saveBusinessState(s) {
              persistedBusiness = s;
            },
            async appendAuditEvent() {
              throw new Error('Simulated audit storage failure');
            }
          });
        } catch (err) {
          persistedBusiness = snapshot;
          throw err;
        }
      },
      async persistDeniedAudit(ev) {
        persistedAudits.push(ev);
      }
    };

    const allowedReview = recordHumanReview(
      initial,
      independentReviewerAuth,
      { operationId: 'op-tx-1', correlationId: 'c-tx1', caseId: 'case-1', expectedVersion: 1, decision: 'approved', reason: 'ok', policyVersion: 'p1', aiRecommendationId: 'ai-rec-1' },
      NOW
    );
    await expect(executeWithAtomicAudit(failingAuditStore, allowedReview)).rejects.toThrow('Simulated audit storage failure');
    expect(persistedBusiness.reviewRecords).toHaveLength(0);

    // 2) Denied command persists denied audit separately without touching business state
    const denied = recordHumanReview(
      initial,
      { authenticated: false },
      { operationId: 'op-tx-deny', correlationId: 'c-txd', caseId: 'case-1', expectedVersion: 1, decision: 'approved', reason: 'no', policyVersion: 'p1' },
      NOW
    );
    const denyRes = await executeWithAtomicAudit(failingAuditStore, denied);
    expect(denyRes.ok).toBe(false);
    expect(persistedAudits).toHaveLength(1);
    expect(persistedAudits[0].outcome).toBe('denied');
    expect(persistedBusiness.reviewRecords).toHaveLength(0);

    // 3) Append-only privilege contract forbids UPDATE/DELETE for app role
    expect(APP_ROLE_HISTORY_PRIVILEGES.review_record).toEqual({ select: true, insert: true, update: false, delete: false });
    expect(APP_ROLE_HISTORY_PRIVILEGES.audit_event).toEqual({ select: true, insert: true, update: false, delete: false });

    // 4) Secret/PII keys stripped and credential strings redacted from audit diffs
    const sanitized = sanitizeAuditDiffSummary({
      stage: 'requested',
      password: 'do-not-log',
      sessionToken: 'secret-token',
      cookie: 'authjs.session-token=xyz',
      email: 'user@example.invalid',
      note: 'postgresql://user:pass@localhost:5432/db'
    });
    expect(sanitized).toEqual({ stage: 'requested', note: '[REDACTED]' });
    expect(() =>
      assertAuditEventSanitized({
        id: 'a1',
        operationId: 'op',
        actorAccountId: 'u1',
        action: 'case.review',
        targetId: 'case-1',
        targetRevision: 1,
        outcome: 'allowed',
        reasonCode: 'OK',
        occurredAt: NOW,
        correlationId: 'c1',
        diffSummary: { token: 'leaked' }
      })
    ).toThrow('Forbidden audit key');
  });
});
