import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { createPgSimulationWorkbench } from '../apps/web/lib/workbench-runtime';

const DB_URL = process.env.DATABASE_URL;

describe.runIf(Boolean(DB_URL))('M4 Web Workbench <-> PostgreSQL/PostGIS persistence & restart survival', () => {
  it('auto-migrates, computes distances with PostGIS ST_Distance, persists full M2-M4 flow across restarts, and blocks destructive reset', async () => {
    const baseUrl = new URL(DB_URL!);
    const tempDb = `satoyama_wb_${randomBytes(4).toString('hex')}`;
    const adminUrl = new URL(baseUrl.toString());
    adminUrl.pathname = '/postgres';
    const adminPool = new pg.Pool({ connectionString: adminUrl.toString() });

    await adminPool.query(`CREATE DATABASE "${tempDb}"`);
    const targetUrl = new URL(baseUrl.toString());
    targetUrl.pathname = `/${tempDb}`;
    const pool = new pg.Pool({ connectionString: targetUrl.toString() });
    pool.on('error', (err: Error & { code?: string }) => {
      if (err.code !== '57P01') throw err;
    });

    try {
      let tick = 0;
      const now = () => `2026-11-25T15:00:${String(tick++).padStart(2, '0')}Z`;
      const wb1 = createPgSimulationWorkbench(pool, { now });

      // 1. Initial load auto-applies migrations 0001-0004 & seeds Phase 1 data
      const snap0 = await wb1.getSnapshot();
      expect(snap0.persistence.mode).toBe('postgis');
      expect(snap0.persistence.spatialEngine).toBe('PostGIS ST_Distance');
      expect(snap0.publicCatalog.activities).toEqual([]);
      expect(snap0.simulationActivities.length).toBeGreaterThanOrEqual(2);
      expect(snap0.recommendations.some((r) => r.geographic.distanceMeters !== null)).toBe(true);
      expect(snap0.recommendations.find((r) => r.actorId === 'sim-gov-001')?.geographic.distanceMeters).toBeNull();

      // 2. Propose a new simulated activity with coordinates + date
      const prop = await wb1.createActivityProposal('creator', {
        title: 'PostGIS永続化テスト活動',
        locationLabel: '南斜面（概算座標）',
        latitude: 35.642,
        longitude: 139.272,
        scheduleStartAt: '2026-12-20T09:30',
        requiredSkills: ['植生観察'],
        transportModes: ['地域バス']
      });
      expect(prop.ok).toBe(true);
      if (!prop.ok) return;
      const newActId = prop.activity.id;
      const matched = prop.snapshot.recommendations.find((r) => r.actorId === 'sim-person-002');
      expect(matched?.geographic.distanceMeters).not.toBeNull();

      // 3. Create draft case, verify AI-before-human enforcement, run AI, verify self-review ban, approve, advance
      const created = await wb1.createDraftCase('creator', {
        activityId: newActId,
        candidateActorId: 'sim-person-002'
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const caseId = created.caseId;

      const noAi = await wb1.submitHumanReview('reviewer', {
        caseId,
        expectedVersion: 1,
        decision: 'approved',
        reason: 'AI前承認テスト'
      });
      expect(noAi.ok).toBe(false);
      if (!noAi.ok) expect(noAi.reasonCode).toBe('AI_RECOMMENDATION_REQUIRED');

      const aiRes = await wb1.runAIPrimaryReview(caseId);
      expect(aiRes.ok).toBe(true);
      if (!aiRes.ok) return;

      const selfRev = await wb1.submitHumanReview('creator', {
        caseId,
        expectedVersion: 1,
        decision: 'approved',
        reason: '自己審査テスト',
        aiRecommendationId: aiRes.assessment.record.id
      });
      expect(selfRev.ok).toBe(false);
      if (!selfRev.ok) expect(selfRev.reasonCode).toBe('SELF_REVIEW_PROHIBITED');

      const approved = await wb1.submitHumanReview('reviewer', {
        caseId,
        expectedVersion: 1,
        decision: 'approved',
        reason: 'PostGIS永続化承認テスト',
        aiRecommendationId: aiRes.assessment.record.id
      });
      expect(approved.ok).toBe(true);

      const toReq = await wb1.advanceCaseStage('coordinator', {
        caseId,
        expectedVersion: 1,
        targetStage: 'requested',
        simulationNote: 'DB永続化された模擬依頼'
      });
      expect(toReq.ok).toBe(true);

      const toResp = await wb1.advanceCaseStage('coordinator', {
        caseId,
        expectedVersion: 1,
        targetStage: 'responded',
        simulationNote: 'DB永続化された模擬応答'
      });
      expect(toResp.ok).toBe(true);

      // 4. Reset MUST be refused in PostGIS persistent mode (history protection)
      const resetRes = await wb1.reset();
      expect(resetRes.ok).toBe(false);
      if (!resetRes.ok) expect(resetRes.reasonCode).toBe('POSTGIS_PERSISTENT_MODE');

      // 5. Simulate full server restart: instantiate a brand-new PgSimulationWorkbench against the same DB
      const wbAfterRestart = createPgSimulationWorkbench(pool, { now });
      const persisted = await wbAfterRestart.getSnapshot(newActId);

      expect(persisted.persistence.mode).toBe('postgis');
      expect(persisted.simulationActivities.some((a) => a.id === newActId)).toBe(true);
      const reloadedCase = persisted.cases.find((c) => c.id === caseId);
      expect(reloadedCase?.stage).toBe('responded');
      expect(reloadedCase?.revision).toBe(1);
      expect(persisted.aiRecommendations.some((r) => r.id === aiRes.assessment.record.id)).toBe(true);
      expect(persisted.aiAssessments.some((a) => a.record.id === aiRes.assessment.record.id)).toBe(true);
      expect(persisted.reviewRecords.filter((r) => r.caseId === caseId)).toHaveLength(1);
      expect(persisted.collaborationNotes.filter((n) => n.caseId === caseId)).toHaveLength(2);
      expect(persisted.auditEvents.some((e) => e.reasonCode === 'AI_RECOMMENDATION_REQUIRED' && e.outcome === 'denied')).toBe(true);
      expect(persisted.auditEvents.some((e) => e.reasonCode === 'SELF_REVIEW_PROHIBITED' && e.outcome === 'denied')).toBe(true);
      expect(persisted.auditEvents.some((e) => e.reasonCode === 'STAGE_TRANSITIONED' && e.outcome === 'allowed')).toBe(true);
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
