import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  applyMaterialCaseChange,
  createCollaborationDraft,
  recordHumanReview,
  transitionSimulationCase,
  type GovernedDomainState,
  type LocationConditionsGraph,
  type ServerAuthContext
} from '@satoyama/domain';
import { recommendSimulationCandidates } from '@satoyama/matching';
import {
  appendAIRecommendation,
  deterministicPrimaryReviewer,
  getCaseReviewReadiness
} from '@satoyama/ai-review';
import { applyMigrations, loadMigrationFiles } from '../db/migrator';
import { PgM1Repository } from '../db/repository';

const DB_URL = process.env.DATABASE_URL;
const NOW = '2026-11-25T10:00:00Z';

function buildGovernedFixture(): GovernedDomainState {
  const actorOrg = {
    id: 'sim-org-1',
    domain: 'simulation' as const,
    kind: 'organization' as const,
    displayName: '模擬里山保全会',
    expertise: [{ label: '地域調整', evidence: null }]
  };
  const actorPerson = {
    id: 'sim-person-1',
    domain: 'simulation' as const,
    kind: 'person' as const,
    displayName: '模擬参加者 太郎',
    expertise: [{ label: '竹林整備', evidence: null }]
  };
  const act = {
    id: 'sim-act-1',
    domain: 'simulation' as const,
    revision: 1,
    title: '【模擬】竹林整備テスト活動'
  };

  const baseGraph: LocationConditionsGraph = {
    actors: [actorOrg, actorPerson],
    memberships: [],
    activities: [act],
    activityRevisions: [act],
    activityParties: [{ activityId: act.id, actorId: actorOrg.id, role: '主催' }],
    cases: [],
    interests: [],
    needs: [],
    sources: [],
    assertions: [],
    actorRevisions: [
      { actor: actorOrg, revision: 1 },
      { actor: actorPerson, revision: 1 }
    ],
    actorAssertions: [],
    locations: [
      {
        id: 'loc-1',
        activityId: act.id,
        activityRevision: 1,
        label: '模擬集合地点',
        coordinates: { srid: 4326, latitude: 35.63, longitude: 139.26 },
        precision: 'approximate',
        publicGranularity: 'municipality',
        acquisitionBasis: 'テスト用概算座標',
        confirmedOn: null,
        sourceId: null
      },
      {
        id: 'loc-2',
        activityId: act.id,
        activityRevision: 1,
        label: '模擬倉庫（座標欠損）',
        coordinates: null,
        precision: 'unknown',
        publicGranularity: 'withheld',
        acquisitionBasis: '欠損保持テスト',
        confirmedOn: null,
        sourceId: null
      }
    ],
    participationConditions: [
      {
        id: 'cond-1',
        target: { activityId: act.id, activityRevision: 1 },
        schedule: {
          timeZone: 'Asia/Tokyo',
          dates: { state: 'specified', value: [{ startAt: '2026-12-10T09:00:00+09:00', endAt: null, label: null }] },
          timeWindowNote: { state: 'not-stated' }
        },
        skills: { state: 'specified', value: [{ label: '竹林整備', required: true }] },
        qualifications: {
          state: 'specified',
          value: [{ name: '刈払機安全教育', verificationRequired: true }]
        },
        capacity: { state: 'specified', value: { min: 1, max: 5 } },
        fee: { state: 'no-restriction', note: null },
        itemsToBring: { state: 'not-stated' },
        transport: { state: 'specified', value: { modes: ['自家用車'], accessNote: null } },
        ageOrOtherConstraints: { state: 'unknown', note: '人間確認待ち' },
        itemsToConfirm: ['安全装備と集合場所を確認する'],
        sourceId: null
      }
    ],
    resourceRequirements: [],
    actorSkills: []
  };

  const draft = createCollaborationDraft(
    baseGraph,
    'sim-case-m3',
    { id: act.id, domain: 'simulation', revision: 1 },
    [
      { actorId: actorOrg.id, role: '主催' },
      { actorId: actorPerson.id, role: '候補者' }
    ]
  );

  return {
    graph: { ...baseGraph, cases: [draft] },
    caseGovernance: [
      {
        caseId: draft.id,
        createdByAccountId: 'acct-creator',
        lastMaterialChangeByAccountId: null,
        lastMaterialChangeRevision: 1
      }
    ],
    aiRecommendations: [],
    reviewRecords: [],
    auditEvents: [],
    processedOperationIds: []
  };
}

describe('M3 AI Primary Review engine', () => {
  it('produces structured primary assessment from M2 matching evidence without approving or calling external APIs', async () => {
    const state = buildGovernedFixture();
    const m2Recs = recommendSimulationCandidates({
      graph: state.graph,
      activityId: 'sim-act-1',
      activityRevision: 1,
      actorProfiles: [
        {
          actorId: 'sim-person-1',
          baseCoordinates: { srid: 4326, latitude: 35.635, longitude: 139.265 },
          availableTransportModes: ['自家用車'],
          willingness: 'explicit-interest'
        }
      ]
    });

    const assessment = await deterministicPrimaryReviewer.evaluateCase({
      state,
      caseId: 'sim-case-m3',
      recommendationId: 'ai-rec-1',
      generatedAt: NOW,
      matchingEvidence: m2Recs.filter((r) => r.actorId === 'sim-person-1')
    });

    expect(assessment.mode).toBe('simulation-ai-primary');
    expect(assessment.status).toBe('requires-human-review');
    expect(assessment.canApprove).toBe(false);
    expect(assessment.canTransition).toBe(false);
    expect(assessment.qualificationVerified).toBe(false);
    expect(assessment.impliesAgreement).toBe(false);
    expect(assessment.provenance.externalApiCalled).toBe(false);
    expect(assessment.record.status).toBe('requires-human-review');
    expect(assessment.record.caseRevision).toBe(1);
    expect(assessment.risksAndGaps.some((r) => r.includes('欠損'))).toBe(true);
    expect(assessment.requiredHumanChecks.some((c) => c.includes('資格'))).toBe(true);

    const withAI = appendAIRecommendation(state, assessment);
    expect(withAI.aiRecommendations).toHaveLength(1);
    expect(state.aiRecommendations).toHaveLength(0); // immutable

    // AI recommendation alone MUST NOT allow transition to requested
    const editorAuth: ServerAuthContext = {
      authenticated: true,
      userAccountId: 'acct-editor',
      grants: [{ role: 'simulation-editor', scope: { kind: 'global' }, revokedAt: null, expiresAt: null }],
      operatedActorIds: [],
      issuedAt: NOW
    };
    const denied = transitionSimulationCase(
      withAI,
      editorAuth,
      { operationId: 'op-t1', correlationId: 'c1', caseId: 'sim-case-m3', expectedVersion: 1, targetStage: 'requested' },
      NOW
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reasonCode).toBe('HUMAN_APPROVAL_REQUIRED');
  });

  it('tracks revision-pinned readiness and detects stale approvals after material case change', async () => {
    const state = buildGovernedFixture();
    const assessment = await deterministicPrimaryReviewer.evaluateCase({
      state,
      caseId: 'sim-case-m3',
      recommendationId: 'ai-rec-r1',
      generatedAt: NOW
    });
    const s1 = appendAIRecommendation(state, assessment);

    const reviewerAuth: ServerAuthContext = {
      authenticated: true,
      userAccountId: 'acct-independent-reviewer',
      grants: [{ role: 'reviewer', scope: { kind: 'global' }, revokedAt: null, expiresAt: null }],
      operatedActorIds: [],
      issuedAt: NOW
    };
    const approved = recordHumanReview(
      s1,
      reviewerAuth,
      {
        operationId: 'op-rev-1',
        correlationId: 'c-rev-1',
        caseId: 'sim-case-m3',
        expectedVersion: 1,
        decision: 'approved',
        reason: '第三者確認済み',
        policyVersion: 'm3-v0.1',
        aiRecommendationId: 'ai-rec-r1'
      },
      NOW
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;

    const r1 = getCaseReviewReadiness(approved.state, 'sim-case-m3');
    expect(r1.humanDecisionStatus).toBe('approved');
    expect(r1.canAdvanceStage).toBe(true);
    expect(r1.nextSequentialStage).toBe('requested');

    const editorAuth: ServerAuthContext = {
      authenticated: true,
      userAccountId: 'acct-editor',
      grants: [{ role: 'simulation-editor', scope: { kind: 'global' }, revokedAt: null, expiresAt: null }],
      operatedActorIds: [],
      issuedAt: NOW
    };
    const changed = applyMaterialCaseChange(
      approved.state,
      editorAuth,
      {
        operationId: 'op-chg-1',
        correlationId: 'c-chg-1',
        caseId: 'sim-case-m3',
        expectedVersion: 1,
        changeKind: 'participation-condition',
        changeSummary: '重要条件更新'
      },
      NOW
    );
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;

    const r2 = getCaseReviewReadiness(changed.state, 'sim-case-m3');
    expect(r2.caseRevision).toBe(2);
    expect(r2.humanDecisionStatus).toBe('pending');
    expect(r2.staleReviewCount).toBe(1);
    expect(r2.staleAIRecommendationCount).toBe(1);
    expect(r2.canAdvanceStage).toBe(false);
  });
});

describe.runIf(Boolean(DB_URL))('M3 AI Review + PostGIS persistence round-trip', () => {
  it('persists M3 AIRecommendationRecord and links human ReviewRecord atomically in PostGIS', async () => {
    const baseUrl = new URL(DB_URL!);
    const tempDb = `satoyama_m3_${Date.now()}`;
    const adminUrl = new URL(baseUrl.toString());
    adminUrl.pathname = '/postgres';
    const adminPool = new pg.Pool({ connectionString: adminUrl.toString() });

    await adminPool.query(`CREATE DATABASE "${tempDb}"`);
    const targetUrl = new URL(baseUrl.toString());
    targetUrl.pathname = `/${tempDb}`;
    const pool = new pg.Pool({ connectionString: targetUrl.toString() });
    // Cleanup terminates lingering backends of the temp DB; a closing idle client may then emit
    // 57P01 (admin shutdown). Handle it here so it is not reported as an uncaught exception.
    pool.on('error', (err: Error & { code?: string }) => {
      if (err.code !== '57P01') throw err;
    });

    try {
      const migrations = await loadMigrationFiles(resolve(process.cwd(), 'db/migrations'));
      const client = await pool.connect();
      try {
        await applyMigrations(client, migrations);
      } finally {
        client.release();
      }
      const repo = new PgM1Repository(pool);
      const state = buildGovernedFixture();

      for (const actor of state.graph.actors) await repo.saveSimulationActor(actor);
      for (const act of state.graph.activities) await repo.saveSimulationActivityRevision(act);

      const assessment = await deterministicPrimaryReviewer.evaluateCase({
        state,
        caseId: 'sim-case-m3',
        recommendationId: 'ai-rec-pg-1',
        generatedAt: NOW
      });
      const sWithAI = appendAIRecommendation(state, assessment);
      await repo.saveCollaborationCase(
        sWithAI.graph.cases[0],
        sWithAI.caseGovernance[0],
        sWithAI.aiRecommendations
      );

      const reviewerAuth: ServerAuthContext = {
        authenticated: true,
        userAccountId: 'acct-pg-reviewer',
        grants: [{ role: 'reviewer', scope: { kind: 'global' }, revokedAt: null, expiresAt: null }],
        operatedActorIds: [],
        issuedAt: NOW
      };
      const reviewRes = recordHumanReview(
        sWithAI,
        reviewerAuth,
        {
          operationId: 'op-pg-review-1',
          correlationId: 'corr-pg-1',
          caseId: 'sim-case-m3',
          expectedVersion: 1,
          decision: 'approved',
          reason: 'PostGIS 連携確認済み',
          policyVersion: 'm3-v0.1',
          aiRecommendationId: 'ai-rec-pg-1'
        },
        NOW
      );
      expect(reviewRes.ok).toBe(true);
      if (!reviewRes.ok) return;

      const commit = await repo.commitAtomicCaseMutation({
        operationId: 'op-pg-review-1',
        caseId: 'sim-case-m3',
        expectedVersion: 1,
        nextRevision: 1,
        nextStage: 'draft',
        auditEvent: reviewRes.auditEvent,
        reviewRecord: reviewRes.state.reviewRecords[0]
      });
      expect(commit.applied).toBe(true);

      // Migration 0003: DB accepts the simulated 'responded' stage and still rejects unknown stages
      await pool.query("UPDATE simulation.collaboration_case SET stage = 'responded' WHERE id = 'sim-case-m3'");
      await expect(
        pool.query("UPDATE simulation.collaboration_case SET stage = 'bogus' WHERE id = 'sim-case-m3'")
      ).rejects.toThrow();

      const snap = await repo.loadSnapshot();
      expect(snap.aiRecommendations).toHaveLength(1);
      expect(snap.aiRecommendations[0].id).toBe('ai-rec-pg-1');
      expect(snap.aiRecommendations[0].status).toBe('requires-human-review');
      expect(snap.reviewRecords).toHaveLength(1);
      expect(snap.reviewRecords[0].aiRecommendationId).toBe('ai-rec-pg-1');
      expect(snap.cases.find((c) => c.id === 'sim-case-m3')?.stage).toBe('responded');
      expect(snap.auditEvents.some((e) => e.operationId === 'op-pg-review-1' && e.outcome === 'allowed')).toBe(true);
    } finally {
      await pool.end();
      await adminPool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [tempDb]
      );
      await adminPool.query(`DROP DATABASE IF EXISTS "${tempDb}"`);
      await adminPool.end();
    }
  }, 30_000);
});
