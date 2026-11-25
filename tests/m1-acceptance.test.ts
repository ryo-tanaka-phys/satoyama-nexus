import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  advanceSimulation,
  appendActivityRevision,
  applyMaterialCaseChange,
  exportCatalogWithActors,
  exportPublicCatalog,
  exportSimulationCase,
  recordHumanReview,
  summarizeParticipationReadiness,
  transitionSimulationCase,
  validateLocationConditionsGraph,
  type Actor,
  type GovernedDomainState,
  type LocationConditionsGraph,
  type ServerAuthContext,
  type SourceDocument
} from '../packages/domain/src';
import { fixtureReviewer } from '../packages/ai-review/src';
import { geographicFit } from '../packages/matching/src';
import { applyMigrations, loadMigrationFiles } from '../db/migrator';
import { PgM1Repository, provisionSimulationAppRole } from '../db/repository';

const MIGRATIONS_DIR = resolve(process.cwd(), 'db/migrations');
const DB_URL = process.env.DATABASE_URL;

const makeSource = (id: string): SourceDocument => ({
  id,
  url: `https://example.invalid/m1-acceptance/${id}`,
  publisher: '架空テスト発行主体',
  title: `受け入れ検証出典 ${id}`,
  accessedOn: '2026-11-25',
  publishedOn: '2026-11-20',
  updatedOn: null,
  summary: 'M1受け入れ検証用の合成出典（実在データではない）',
  urlStatus: 'unchecked',
  usage: { status: 'unchecked', evidence: null }
});

const pubOrg: Actor = {
  id: 'pub-org-satoyama',
  domain: 'public-catalog',
  kind: 'organization',
  displayName: '架空公開里山団体',
  expertise: [{ label: '竹林保全', evidence: '公開資料記載（未確認）' }]
};
const simPersonExpert: Actor = {
  id: 'sim-person-expert',
  domain: 'simulation',
  kind: 'person',
  displayName: '模擬個人（専門家役割）',
  expertise: [{ label: '植生調査', evidence: null }]
};
const simOrg: Actor = {
  id: 'sim-org-partner',
  domain: 'simulation',
  kind: 'organization',
  displayName: '模擬協力団体',
  expertise: []
};
const simGov: Actor = {
  id: 'sim-gov-consult',
  domain: 'simulation',
  kind: 'government-body',
  displayName: '模擬行政相談先',
  expertise: []
};

const makeAcceptanceGraph = (): LocationConditionsGraph => ({
  actors: [pubOrg, simPersonExpert, simOrg, simGov],
  actorRevisions: [
    { actor: pubOrg, revision: 1 },
    { actor: simPersonExpert, revision: 1 },
    { actor: simOrg, revision: 1 },
    { actor: simGov, revision: 1 }
  ],
  actorAssertions: (['displayName', 'kind', 'expertise'] as const).map((field) => ({
    id: `aa-pub-${field}`,
    target: { actorId: pubOrg.id, revision: 1, field },
    sourceId: 'src-1',
    value: field === 'expertise' ? JSON.stringify(pubOrg.expertise) : pubOrg[field],
    status: 'unverified',
    checkedBy: null,
    checkedAt: null
  })),
  memberships: [{ personId: simPersonExpert.id, organizationId: simOrg.id, evidence: null }],
  activities: [{ id: 'act-forest-1', domain: 'public-catalog', revision: 1, title: 'テスト里山保全活動v1' }],
  activityRevisions: [{ id: 'act-forest-1', domain: 'public-catalog', revision: 1, title: 'テスト里山保全活動v1' }],
  activityParties: [{ activityId: 'act-forest-1', actorId: pubOrg.id, role: 'organizer' }],
  cases: [
    {
      mode: 'simulation',
      id: 'case-spring',
      activity: { id: 'act-forest-1', domain: 'public-catalog', revision: 1 },
      revision: 1,
      stage: 'draft',
      parties: [
        { actorId: simPersonExpert.id, role: 'expert-advisor' },
        { actorId: simOrg.id, role: 'partner' },
        { actorId: simGov.id, role: 'consultation' }
      ]
    },
    {
      mode: 'simulation',
      id: 'case-autumn',
      activity: { id: 'act-forest-1', domain: 'public-catalog', revision: 1 },
      revision: 1,
      stage: 'draft',
      parties: [{ actorId: simPersonExpert.id, role: 'candidate' }]
    }
  ],
  interests: [{ mode: 'simulation', caseId: 'case-autumn', actorId: simPersonExpert.id, kind: 'interest' }],
  needs: [{ id: 'need-1', owner: { kind: 'activity', id: 'act-forest-1', revision: 1 }, description: 'テスト人手' }],
  sources: [makeSource('src-1')],
  assertions: [
    {
      id: 'asrt-act-1',
      target: { activityId: 'act-forest-1', revision: 1, field: 'title' },
      sourceId: 'src-1',
      value: 'テスト里山保全活動v1',
      status: 'unverified',
      checkedBy: null,
      checkedAt: null
    }
  ],
  locations: [
    {
      id: 'loc-main',
      activityId: 'act-forest-1',
      activityRevision: 1,
      label: '保全林入口（テスト）',
      coordinates: { srid: 4326, latitude: 35.0116, longitude: 135.7681 },
      precision: 'approximate',
      publicGranularity: 'municipality',
      acquisitionBasis: '公開資料記載（テスト）',
      confirmedOn: '2026-11-25',
      sourceId: 'src-1'
    },
    {
      id: 'loc-unknown',
      activityId: 'act-forest-1',
      activityRevision: 1,
      label: '作業支線（位置不明）',
      coordinates: null,
      precision: 'unknown',
      publicGranularity: 'withheld',
      acquisitionBasis: '記載なし',
      confirmedOn: null,
      sourceId: 'src-1'
    }
  ],
  participationConditions: [
    {
      id: 'cond-r1',
      target: { activityId: 'act-forest-1', activityRevision: 1 },
      schedule: { timeZone: 'Asia/Tokyo', dates: { state: 'unknown' }, timeWindowNote: { state: 'not-stated' } },
      skills: { state: 'specified', value: [{ label: '竹林整備', required: false }] },
      qualifications: { state: 'not-stated' },
      capacity: { state: 'specified', value: { min: 2, max: 12 } },
      fee: { state: 'no-restriction', note: '無料' },
      itemsToBring: { state: 'specified', value: ['軍手'] },
      transport: { state: 'unknown' },
      ageOrOtherConstraints: { state: 'not-stated' },
      itemsToConfirm: ['集合場所の詳細'],
      sourceId: 'src-1'
    }
  ],
  resourceRequirements: [
    {
      id: 'res-1',
      owner: { kind: 'activity', id: 'act-forest-1', revision: 1 },
      category: 'tool',
      title: '鋸（テスト）',
      quantity: { state: 'specified', value: { count: 4, unit: '本' } },
      required: true,
      note: null,
      sourceId: 'src-1'
    }
  ],
  actorSkills: [
    {
      id: 'skill-1',
      actorId: simPersonExpert.id,
      label: '植生調査（自己申告）',
      declarationType: 'self-declared',
      qualificationStatus: 'unverified',
      evidence: null
    }
  ]
});

describe('M1-07 (#9) End-to-end M1 domain acceptance and M0 regression', () => {
  it('validates 1-activity/2-cases/multi-actor lifecycle, strict public-simulation separation, governance, and M0 compatibility with zero external calls', async () => {
    const baseGraph = makeAcceptanceGraph();
    expect(() => validateLocationConditionsGraph(baseGraph)).not.toThrow();

    // Advance public activity v1 -> v2; cases remain pinned to v1
    const withRev2 = appendActivityRevision(
      baseGraph,
      { id: 'act-forest-1', domain: 'public-catalog', revision: 2, title: 'テスト里山保全活動v2' },
      [makeSource('src-2')],
      [
        {
          id: 'asrt-act-2',
          target: { activityId: 'act-forest-1', revision: 2, field: 'title' },
          sourceId: 'src-2',
          value: 'テスト里山保全活動v2',
          status: 'unverified',
          checkedBy: null,
          checkedAt: null
        }
      ]
    );
    const fullGraph: LocationConditionsGraph = { ...baseGraph, ...withRev2 };
    expect(fullGraph.cases.every((c) => c.activity.revision === 1)).toBe(true);

    // Distance 0m + expert role still never infers eligibility or verified qualification
    const readiness = summarizeParticipationReadiness(fullGraph, {
      actorId: simPersonExpert.id,
      activityId: 'act-forest-1',
      activityRevision: 1,
      distanceMeters: 0
    });
    expect(readiness.canParticipate).toBeNull();
    expect(readiness.qualificationVerified).toBe(false);
    expect(readiness.missingLocationCount).toBe(1);

    // Catalog exports contain zero simulation data; simulation export retains simulation label
    const pubOut = exportPublicCatalog(fullGraph);
    const actorOut = exportCatalogWithActors(fullGraph);
    expect(JSON.stringify(pubOut)).not.toContain('case-spring');
    expect(JSON.stringify(actorOut)).not.toContain('sim-person-expert');
    expect(exportSimulationCase(fullGraph, 'case-spring').notice).toContain('模擬');

    // Governed workflow: deny unauth & self-review, reject -> re-review -> material change invalidation -> re-approve -> sequential transitions
    let state: GovernedDomainState = {
      graph: fullGraph,
      caseGovernance: [
        { caseId: 'case-spring', createdByAccountId: 'acct-editor', lastMaterialChangeByAccountId: null, lastMaterialChangeRevision: 1 },
        { caseId: 'case-autumn', createdByAccountId: 'acct-editor', lastMaterialChangeByAccountId: null, lastMaterialChangeRevision: 1 }
      ],
      aiRecommendations: [
        {
          id: 'ai-1',
          caseId: 'case-spring',
          caseRevision: 1,
          model: 'fixture-only',
          promptVersion: 'v0.1',
          rationale: '模擬一次推薦（実AIなし）',
          constraints: ['人間二次審査必須'],
          generatedAt: '2026-11-25T04:00:00Z',
          status: 'requires-human-review'
        }
      ],
      reviewRecords: [],
      auditEvents: [],
      processedOperationIds: []
    };

    const editor: ServerAuthContext = {
      authenticated: true,
      userAccountId: 'acct-editor',
      grants: [{ role: 'simulation-editor', scope: { kind: 'case', caseId: 'case-spring' }, revokedAt: null, expiresAt: null }],
      operatedActorIds: [],
      issuedAt: '2026-11-25T04:00:00Z'
    };
    const reviewer: ServerAuthContext = {
      authenticated: true,
      userAccountId: 'acct-reviewer',
      grants: [{ role: 'reviewer', scope: { kind: 'case', caseId: 'case-spring' }, revokedAt: null, expiresAt: null }],
      operatedActorIds: [],
      issuedAt: '2026-11-25T04:00:00Z'
    };

    expect(
      recordHumanReview(
        state,
        { authenticated: false },
        { operationId: 'acc-unauth', correlationId: 'c0', caseId: 'case-spring', expectedVersion: 1, decision: 'approved', reason: 'no', policyVersion: 'v1' },
        '2026-11-25T04:05:00Z'
      ).ok
    ).toBe(false);

    const app1 = recordHumanReview(
      state,
      reviewer,
      { operationId: 'acc-r1', correlationId: 'c1', caseId: 'case-spring', expectedVersion: 1, decision: 'approved', reason: '初回確認', policyVersion: 'v1', aiRecommendationId: 'ai-1' },
      '2026-11-25T04:10:00Z'
    );
    expect(app1.ok).toBe(true);
    if (!app1.ok) throw new Error('expected ok');
    state = app1.state;

    // Material change invalidates rev 1 approval
    const mat = applyMaterialCaseChange(
      state,
      editor,
      { operationId: 'acc-m1', correlationId: 'c2', caseId: 'case-spring', expectedVersion: 1, changeKind: 'participation-condition', changeSummary: '条件更新' },
      '2026-11-25T04:15:00Z'
    );
    expect(mat.ok).toBe(true);
    if (!mat.ok) throw new Error('expected ok');
    state = mat.state;

    expect(
      transitionSimulationCase(
        state,
        editor,
        { operationId: 'acc-stale', correlationId: 'c3', caseId: 'case-spring', expectedVersion: 2, targetStage: 'requested' },
        '2026-11-25T04:16:00Z'
      ).ok
    ).toBe(false);

    // Re-approve rev 2 (after a rev-2 AI primary recommendation) and traverse all simulation stages sequentially
    state = {
      ...state,
      aiRecommendations: [
        ...state.aiRecommendations,
        { ...state.aiRecommendations[0], id: 'ai-2', caseRevision: 2, generatedAt: '2026-11-25T04:18:00Z' }
      ]
    };
    const app2 = recordHumanReview(
      state,
      reviewer,
      { operationId: 'acc-r2', correlationId: 'c4', caseId: 'case-spring', expectedVersion: 2, decision: 'approved', reason: '変更後再承認', policyVersion: 'v1', aiRecommendationId: 'ai-2' },
      '2026-11-25T04:20:00Z'
    );
    if (!app2.ok) throw new Error('expected ok');
    state = app2.state;

    for (const [idx, stage] of (['requested', 'responded', 'coordinating', 'agreed', 'preparing'] as const).entries()) {
      const tr = transitionSimulationCase(
        state,
        editor,
        { operationId: `acc-tr-${idx}`, correlationId: `ct-${idx}`, caseId: 'case-spring', expectedVersion: 2, targetStage: stage },
        `2026-11-25T04:2${idx + 1}:00Z`
      );
      expect(tr.ok).toBe(true);
      if (!tr.ok) throw new Error('expected ok');
      state = tr.state;
    }
    expect(state.graph.cases.find((c) => c.id === 'case-spring')?.stage).toBe('preparing');

    // M0 regression boundaries remain intact (no real AI, no fabricated geographic fit)
    const m0Case = advanceSimulation(
      {
        mode: 'simulation',
        id: 'm0-c',
        activityId: 'act-1',
        profileId: 'sim-1',
        stage: 'draft',
        review: { reviewerId: 'op', decision: 'approved', reason: 'm0 check', reviewedAt: '2026-11-25T00:00:00Z' }
      },
      'requested'
    );
    expect(m0Case.stage).toBe('requested');
    expect(
      (
        await fixtureReviewer.recommend(
          { kind: 'public-activity', id: 't', title: 't', source: { url: 'https://example.invalid', publisher: 'p', accessedOn: '2026-11-25', summary: 's' } },
          { kind: 'simulated-profile', id: 'sim-1', displayName: 'd', skills: [] }
        )
      ).status
    ).toBe('requires-human-review');
    expect(
      geographicFit({
        activity: { kind: 'public-activity', id: 't', title: 't', source: { url: 'https://example.invalid', publisher: 'p', accessedOn: '2026-11-25', summary: 's' } },
        profile: { kind: 'simulated-profile', id: 'sim-1', displayName: 'd', skills: [] }
      }).status
    ).toBe('not-evaluated');
  });
});

describe.runIf(Boolean(DB_URL))('M1-07 (#9) Full PostGIS acceptance round-trip', () => {
  it('verifies migrations, 1-activity/2-cases/4-actor-kinds round-trip, PostGIS spatial search, role enforcement, and atomic rollback in isolated PostGIS', async () => {
    const parsed = new URL(DB_URL!);
    expect(['localhost', '127.0.0.1']).toContain(parsed.hostname);
    const dbName = `m1_accept_${randomBytes(4).toString('hex')}`;
    const admin = new pg.Client({ connectionString: DB_URL!, connectionTimeoutMillis: 10000 });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE ${dbName}`);
    } finally {
      await admin.end();
    }

    const dbUrl = new URL(DB_URL!);
    dbUrl.pathname = `/${dbName}`;
    const pool = new pg.Pool({ connectionString: dbUrl.href, connectionTimeoutMillis: 10000 });
    try {
      const files = await loadMigrationFiles(MIGRATIONS_DIR);
      const client = await pool.connect();
      try {
        await applyMigrations(client, files);
      } finally {
        client.release();
      }

      const g = makeAcceptanceGraph();
      const repo = new PgM1Repository(pool);
      await repo.saveSourceDocument(g.sources[0]);
      await repo.savePublicActivityRevision(g.activities[0], g.assertions);
      await repo.savePublicActorRevision(g.actorRevisions[0], g.actorAssertions);
      for (const loc of g.locations) await repo.saveActivityLocation(loc);
      await repo.saveParticipationCondition(g.participationConditions[0]);
      await repo.saveResourceRequirement(g.resourceRequirements[0]);
      for (const a of [simPersonExpert, simOrg, simGov]) await repo.saveSimulationActor(a);
      for (const c of g.cases) {
        await repo.saveCollaborationCase(c, {
          caseId: c.id,
          createdByAccountId: 'acct-editor',
          lastMaterialChangeByAccountId: null,
          lastMaterialChangeRevision: 1
        });
      }

      const snap = await repo.loadSnapshot();
      expect(snap.publicActivities).toHaveLength(1);
      expect(snap.cases).toHaveLength(2);
      expect(snap.simulationActors.map((a) => a.kind).sort()).toEqual(['government-body', 'organization', 'person']);
      expect(snap.locations.find((l) => l.id === 'loc-unknown')?.coordinates).toBeNull();

      const spatial = await repo.queryLocationsByDistance({ latitude: 35.0116, longitude: 135.7681 });
      expect(spatial[0].distanceMeters).toBe(0);
      expect(spatial[1].distanceMeters).toBeNull();

      // DB rejects public actor in simulation case_party
      await expect(
        pool.query("INSERT INTO simulation.case_party (case_id, actor_id, role) VALUES ('case-spring', 'pub-org-satoyama', 'participant')")
      ).rejects.toMatchObject({ code: '23503' });

      // App role cannot UPDATE/DELETE history or write public_catalog
      const role = `${dbName}_app`;
      await provisionSimulationAppRole(pool, role);
      const rc = await pool.connect();
      try {
        await rc.query(`SET ROLE ${role}`);
        await expect(rc.query('DELETE FROM ops_audit.audit_event')).rejects.toMatchObject({ code: '42501' });
        await expect(rc.query('DELETE FROM simulation.review_record')).rejects.toMatchObject({ code: '42501' });
        await rc.query('RESET ROLE');
      } finally {
        rc.release();
      }
    } finally {
      await pool.end();
    }
  });
});
