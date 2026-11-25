import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pg, { type Pool } from 'pg';
import { applyMigrations, getAppliedMigrations, loadMigrationFiles, sha256Hex } from '../db/migrator';
import { PgM1Repository, provisionSimulationAppRole } from '../db/repository';

const MIGRATIONS_DIR = resolve(process.cwd(), 'db/migrations');
const DB_URL = process.env.DATABASE_URL;

describe('M1-06 (#8) Versioned SQL migration files static checks', () => {
  it('loads ordered versioned migrations with deterministic SHA-256 checksums and no destructive reset statements', async () => {
    const files = await loadMigrationFiles(MIGRATIONS_DIR);
    expect(files.map((f) => f.version)).toEqual([
      '0001_m1_schemas_and_catalog.sql',
      '0002_m1_simulation_and_audit.sql',
      '0003_add_responded_stage.sql',
      '0004_m4_simulation_workbench_tables.sql',
      '0005_m5_m6_simulated_venue.sql'
    ]);
    for (const f of files) {
      expect(f.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(f.sql).not.toMatch(/\b(DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE)\b/i);
    }
  });
});

async function withIsolatedDatabase(
  baseUrl: string,
  prefix: string,
  fn: (pool: Pool, dbName: string) => Promise<void>
): Promise<void> {
  const parsed = new URL(baseUrl);
  expect(['localhost', '127.0.0.1']).toContain(parsed.hostname);
  const dbName = `${prefix}_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: baseUrl, connectionTimeoutMillis: 10000 });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await admin.end();
  }
  const targetUrl = new URL(baseUrl);
  targetUrl.pathname = `/${dbName}`;
  const pool = new pg.Pool({ connectionString: targetUrl.href, connectionTimeoutMillis: 10000 });
  try {
    await fn(pool, dbName);
  } finally {
    await pool.end();
  }
}

describe.runIf(Boolean(DB_URL))('M1-06 (#8) PostGIS migrations, constraints, roles, spatial queries, and atomic persistence', () => {
  it('migrates empty DB and M0-equivalent DB idempotently, preserves sentinel data, and rejects tampered applied SQL', async () => {
    const files = await loadMigrationFiles(MIGRATIONS_DIR);

    // 1) Empty DB migration + idempotent rerun + tamper rejection
    await withIsolatedDatabase(DB_URL!, 'm1_empty', async (pool) => {
      const client = await pool.connect();
      try {
        const first = await applyMigrations(client, files);
        expect(first.applied).toEqual(files.map((f) => f.version));
        expect(first.skipped).toEqual([]);

        const before = await getAppliedMigrations(client);
        const rerun = await applyMigrations(client, files);
        expect(rerun.applied).toEqual([]);
        expect(rerun.skipped).toEqual(files.map((f) => f.version));
        expect(await getAppliedMigrations(client)).toEqual(before);

        // Tampered SQL file checksum must be rejected
        const tampered = [{ ...files[0], sql: files[0].sql + '\n-- tampered', checksum: sha256Hex(files[0].sql + '\n-- tampered') }, files[1]];
        await expect(applyMigrations(client, tampered)).rejects.toThrow('Migration checksum mismatch');
      } finally {
        client.release();
      }
    });

    // 2) M0-equivalent DB (PostGIS extension + unrelated sentinel data preserved untouched)
    await withIsolatedDatabase(DB_URL!, 'm1_m0', async (pool) => {
      await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
      await pool.query("CREATE TABLE public.m0_sentinel (id text PRIMARY KEY, payload text NOT NULL); INSERT INTO public.m0_sentinel VALUES ('keep', 'intact')");
      const client = await pool.connect();
      try {
        const res = await applyMigrations(client, files);
        expect(res.applied).toHaveLength(files.length);
      } finally {
        client.release();
      }
      const sentinel = await pool.query('SELECT id, payload FROM public.m0_sentinel');
      expect(sentinel.rows).toEqual([{ id: 'keep', payload: 'intact' }]);
    });
  });

  it('rolls back mid-migration failure preserving prior applied data and recovers forward without reset', async () => {
    const files = await loadMigrationFiles(MIGRATIONS_DIR);

    await withIsolatedDatabase(DB_URL!, 'm1_fail', async (pool) => {
      const client = await pool.connect();
      try {
        // Apply 0001 and insert a real catalog row that must survive 0002 failure
        await applyMigrations(client, [files[0]]);
        await client.query(
          "INSERT INTO public_catalog.activity (id, current_revision, title) VALUES ('survivor-act', 1, 'PRESERVE AFTER FAILURE')"
        );

        // Inject failure after DDL inside 0002
        const broken0002 = {
          ...files[1],
          sql: files[1].sql + '\nSELECT * FROM injected_nonexistent_table;\n',
          checksum: sha256Hex(files[1].sql + '\nSELECT * FROM injected_nonexistent_table;\n')
        };
        await expect(applyMigrations(client, [files[0], broken0002])).rejects.toThrow();

        // 0001 history + data survived; 0002 tables rolled back
        expect((await getAppliedMigrations(client)).map((r) => r.version)).toEqual([files[0].version]);
        const survivor = await client.query("SELECT title FROM public_catalog.activity WHERE id = 'survivor-act'");
        expect(survivor.rows[0].title).toBe('PRESERVE AFTER FAILURE');
        const auditReg = await client.query<{ t: string | null }>("SELECT to_regclass('ops_audit.audit_event') AS t");
        expect(auditReg.rows[0].t).toBeNull();

        // Fix unapplied 0002 SQL and recover forward without DROP/TRUNCATE/reset
        const recovered = await applyMigrations(client, files);
        expect(recovered.applied).toEqual(files.slice(1).map((f) => f.version));
        expect(recovered.skipped).toEqual([files[0].version]);
        expect((await client.query("SELECT title FROM public_catalog.activity WHERE id = 'survivor-act'")).rows[0].title).toBe('PRESERVE AFTER FAILURE');
      } finally {
        client.release();
      }
    });
  });

  it('persists round-trip M1 entities, enforces DB isolation/PostGIS/GiST/roles, and guarantees atomic audit rollback and idempotency', async () => {
    const files = await loadMigrationFiles(MIGRATIONS_DIR);

    await withIsolatedDatabase(DB_URL!, 'm1_repo', async (pool, dbName) => {
      const client = await pool.connect();
      try {
        await applyMigrations(client, files);
      } finally {
        client.release();
      }

      const repo = new PgM1Repository(pool);

      // 1) Round-trip save: source, public activity, public actor, 2 locations (valid 4326 + NULL), condition, resource, 2 sim actors, 2 cases on 1 activity
      await repo.saveSourceDocument({
        id: 'src-1',
        url: 'https://example.invalid/m1-db',
        publisher: '架空テスト発行者',
        title: 'DB検証資料',
        accessedOn: '2026-11-25',
        publishedOn: null,
        updatedOn: null,
        summary: 'テスト専用出典',
        urlStatus: 'unchecked',
        usage: { status: 'unchecked', evidence: null }
      });

      await repo.savePublicActivityRevision(
        { id: 'act-1', domain: 'public-catalog', revision: 1, title: '里山保全テスト活動' },
        [
          {
            id: 'asrt-1',
            target: { activityId: 'act-1', revision: 1, field: 'title' },
            sourceId: 'src-1',
            value: '里山保全テスト活動',
            status: 'unverified',
            checkedBy: null,
            checkedAt: null
          }
        ]
      );

      await repo.savePublicActorRevision(
        {
          revision: 1,
          actor: { id: 'pub-org-1', domain: 'public-catalog', kind: 'organization', displayName: '公開テスト団体', expertise: [] }
        },
        [
          { id: 'aa-1', target: { actorId: 'pub-org-1', revision: 1, field: 'displayName' }, sourceId: 'src-1', value: '公開テスト団体', status: 'unverified', checkedBy: null, checkedAt: null },
          { id: 'aa-2', target: { actorId: 'pub-org-1', revision: 1, field: 'kind' }, sourceId: 'src-1', value: 'organization', status: 'unverified', checkedBy: null, checkedAt: null },
          { id: 'aa-3', target: { actorId: 'pub-org-1', revision: 1, field: 'expertise' }, sourceId: 'src-1', value: '[]', status: 'unverified', checkedBy: null, checkedAt: null }
        ]
      );

      await repo.saveActivityLocation({
        id: 'loc-kyoto',
        activityId: 'act-1',
        activityRevision: 1,
        label: '京都テスト拠点',
        coordinates: { srid: 4326, latitude: 35.0116, longitude: 135.7681 },
        precision: 'approximate',
        publicGranularity: 'municipality',
        acquisitionBasis: '公開資料地名より',
        confirmedOn: '2026-11-25',
        sourceId: 'src-1'
      });
      await repo.saveActivityLocation({
        id: 'loc-unknown',
        activityId: 'act-1',
        activityRevision: 1,
        label: '位置不明拠点',
        coordinates: null,
        precision: 'unknown',
        publicGranularity: 'withheld',
        acquisitionBasis: '記載なし',
        confirmedOn: null,
        sourceId: 'src-1'
      });

      await repo.saveParticipationCondition({
        id: 'cond-1',
        target: { activityId: 'act-1', activityRevision: 1 },
        schedule: { timeZone: 'Asia/Tokyo', dates: { state: 'unknown' }, timeWindowNote: { state: 'not-stated' } },
        skills: { state: 'not-stated' },
        qualifications: { state: 'not-stated' },
        capacity: { state: 'specified', value: { min: 1, max: 10 } },
        fee: { state: 'no-restriction' },
        itemsToBring: { state: 'not-stated' },
        transport: { state: 'unknown' },
        ageOrOtherConstraints: { state: 'not-stated' },
        itemsToConfirm: ['持ち物確認'],
        sourceId: 'src-1'
      });

      await repo.saveResourceRequirement({
        id: 'res-1',
        owner: { kind: 'activity', id: 'act-1', revision: 1 },
        category: 'tool',
        title: '剪定ばさみ',
        quantity: { state: 'specified', value: { count: 3, unit: '本' } },
        required: true,
        note: null,
        sourceId: 'src-1'
      });

      await repo.saveSimulationActor({ id: 'sim-p1', domain: 'simulation', kind: 'person', displayName: '模擬個人1', expertise: [] });
      await repo.saveSimulationActor({ id: 'sim-o1', domain: 'simulation', kind: 'organization', displayName: '模擬団体1', expertise: [] });

      for (const cid of ['case-1', 'case-2']) {
        await repo.saveCollaborationCase(
          {
            mode: 'simulation',
            id: cid,
            activity: { id: 'act-1', domain: 'public-catalog', revision: 1 },
            revision: 1,
            stage: 'draft',
            parties: [
              { actorId: 'sim-p1', role: 'candidate' },
              { actorId: 'sim-o1', role: 'candidate' }
            ]
          },
          { caseId: cid, createdByAccountId: 'acct-creator', lastMaterialChangeByAccountId: null, lastMaterialChangeRevision: 1 },
          cid === 'case-1'
            ? [{ id: 'ai-1', caseId: 'case-1', caseRevision: 1, model: 'fixture', promptVersion: 'v1', rationale: '模擬', constraints: ['人間審査必須'], generatedAt: '2026-11-25T03:00:00Z', status: 'requires-human-review' }]
            : []
        );
      }

      // 2) DB-level constraint rejections (public actor in case_party, unknown precision with coords, dual activity ref)
      await expect(
        pool.query("INSERT INTO simulation.case_party (case_id, actor_id, role) VALUES ('case-1', 'pub-org-1', 'participant')")
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        pool.query(
          "INSERT INTO public_catalog.activity_location (id, activity_id, activity_revision, label, coordinates, precision, public_granularity, acquisition_basis, source_id) VALUES ('bad-loc', 'act-1', 1, 'bad', ST_SetSRID(ST_MakePoint(0,0),4326)::geography, 'unknown', 'withheld', 'fake', 'src-1')"
        )
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pool.query(
          "INSERT INTO simulation.collaboration_case (id, mode, public_activity_id, public_activity_revision, simulated_activity_id, simulated_activity_revision, revision, stage) VALUES ('bad-dual', 'simulation', 'act-1', 1, 'act-1', 1, 1, 'draft')"
        )
      ).rejects.toMatchObject({ code: '23514' });

      // 3) PostGIS GiST index + distance query in meters + NULL preservation
      const gistCount = await pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = 'public_catalog' AND indexname = 'idx_pub_activity_location_gist' AND indexdef LIKE '%USING gist%'"
      );
      expect(gistCount.rows[0].n).toBe(1);

      const spatial = await repo.queryLocationsByDistance({ latitude: 35.0116, longitude: 135.7681 });
      expect(spatial).toHaveLength(2);
      expect(spatial[0].locationId).toBe('loc-kyoto');
      expect(spatial[0].distanceMeters).toBe(0);
      expect(spatial[0].precision).toBe('approximate');
      expect(spatial[1].locationId).toBe('loc-unknown');
      expect(spatial[1].distanceMeters).toBeNull();

      // 4) Atomic mutation: audit failure rollback, version conflict, success, idempotent replay, separate denied audit
      await expect(
        repo.commitAtomicCaseMutation({
          operationId: 'op-rollback',
          caseId: 'case-1',
          expectedVersion: 1,
          nextRevision: 1,
          nextStage: 'requested',
          reviewRecord: {
            id: 'rev-rb',
            caseId: 'case-1',
            caseRevision: 1,
            aiRecommendationId: 'ai-1',
            aiRecommendationVersion: 'fixture@v1',
            reviewerAccountId: 'acct-rev',
            permissionScope: 'case:case-1',
            decision: 'approved',
            reason: 'テスト承認',
            reviewedAt: '2026-11-25T04:00:00Z',
            policyVersion: 'v1'
          },
          auditEvent: {
            id: 'aud-rb',
            operationId: 'op-rollback',
            actorAccountId: 'acct-rev',
            action: 'case.transition',
            targetId: 'case-1',
            targetRevision: 1,
            outcome: 'allowed',
            reasonCode: 'STAGE_TRANSITIONED',
            occurredAt: '2026-11-25T04:00:00Z',
            correlationId: 'corr-rb',
            diffSummary: { toStage: 'requested' }
          },
          beforeAuditCommit: async () => {
            throw new Error('Injected audit failure');
          }
        })
      ).rejects.toThrow('Injected audit failure');

      // Verify full rollback: case still 'draft', 0 reviews, 0 audits
      const afterRollback = await repo.loadSnapshot();
      expect(afterRollback.cases.find((c) => c.id === 'case-1')?.stage).toBe('draft');
      expect(afterRollback.reviewRecords).toHaveLength(0);
      expect(afterRollback.auditEvents).toHaveLength(0);

      // Version conflict rejected cleanly
      const conflict = await repo.commitAtomicCaseMutation({
        operationId: 'op-conflict',
        caseId: 'case-1',
        expectedVersion: 99,
        nextRevision: 100,
        nextStage: 'requested',
        auditEvent: {
          id: 'aud-conf',
          operationId: 'op-conflict',
          actorAccountId: 'acct-rev',
          action: 'case.transition',
          targetId: 'case-1',
          targetRevision: 99,
          outcome: 'allowed',
          reasonCode: 'STAGE_TRANSITIONED',
          occurredAt: '2026-11-25T04:01:00Z',
          correlationId: 'corr-c',
          diffSummary: {}
        }
      });
      expect(conflict).toEqual({ applied: false, reason: 'VERSION_CONFLICT' });

      // Valid atomic commit + idempotent replay
      const commitPayload = {
        operationId: 'op-ok-1',
        caseId: 'case-1',
        expectedVersion: 1,
        nextRevision: 1,
        nextStage: 'requested' as const,
        reviewRecord: {
          id: 'rev-ok-1',
          caseId: 'case-1',
          caseRevision: 1,
          aiRecommendationId: 'ai-1',
          aiRecommendationVersion: 'fixture@v1',
          reviewerAccountId: 'acct-rev',
          permissionScope: 'case:case-1',
          decision: 'approved' as const,
          reason: '承認理由',
          reviewedAt: '2026-11-25T04:05:00Z',
          policyVersion: 'v1'
        },
        auditEvent: {
          id: 'aud-ok-1',
          operationId: 'op-ok-1',
          actorAccountId: 'acct-rev',
          action: 'case.transition' as const,
          targetId: 'case-1',
          targetRevision: 1,
          outcome: 'allowed' as const,
          reasonCode: 'STAGE_TRANSITIONED',
          occurredAt: '2026-11-25T04:05:00Z',
          correlationId: 'corr-ok',
          diffSummary: { fromStage: 'draft', toStage: 'requested' }
        }
      };
      expect(await repo.commitAtomicCaseMutation(commitPayload)).toEqual({ applied: true, idempotentReplay: false });
      expect(await repo.commitAtomicCaseMutation(commitPayload)).toEqual({ applied: true, idempotentReplay: true });

      // Separate denied audit persistence
      await repo.appendDeniedAuditEvent({
        id: 'aud-deny-1',
        operationId: 'op-deny-1',
        actorAccountId: null,
        action: 'case.review',
        targetId: 'case-1',
        targetRevision: 1,
        outcome: 'denied',
        reasonCode: 'UNAUTHENTICATED',
        occurredAt: '2026-11-25T04:06:00Z',
        correlationId: 'corr-deny',
        diffSummary: {}
      });

      const snap = await repo.loadSnapshot();
      expect(snap.cases).toHaveLength(2);
      expect(snap.cases.find((c) => c.id === 'case-1')?.stage).toBe('requested');
      expect(snap.reviewRecords).toHaveLength(1);
      expect(snap.auditEvents).toHaveLength(2);
      expect(snap.locations).toHaveLength(2);
      expect(snap.participationConditions).toHaveLength(1);
      expect(snap.resourceRequirements).toHaveLength(1);

      // 5) DB role boundary check (append-only history + no write to public_catalog)
      const roleName = `${dbName}_sim_app`;
      await provisionSimulationAppRole(pool, roleName);
      const roleClient = await pool.connect();
      try {
        await roleClient.query(`SET ROLE ${roleName}`);
        await roleClient.query(
          "INSERT INTO ops_audit.audit_event (id, operation_id, actor_account_id, action, target_id, target_revision, outcome, reason_code, occurred_at, correlation_id, diff_summary) VALUES ('aud-role-1', 'op-role-1', 'acct-1', 'audit.read', 'case-1', 1, 'allowed', 'OK', '2026-11-25T04:10:00Z', 'corr-r', '{}'::jsonb)"
        );
        await expect(roleClient.query("UPDATE ops_audit.audit_event SET reason_code = 'TAMPERED'")).rejects.toMatchObject({ code: '42501' });
        await expect(roleClient.query('DELETE FROM ops_audit.audit_event')).rejects.toMatchObject({ code: '42501' });
        await expect(roleClient.query("UPDATE simulation.review_record SET decision = 'rejected'")).rejects.toMatchObject({ code: '42501' });
        await expect(roleClient.query('DELETE FROM simulation.review_record')).rejects.toMatchObject({ code: '42501' });
        await expect(roleClient.query("INSERT INTO public_catalog.activity (id, current_revision, title) VALUES ('forbid', 1, 'nope')")).rejects.toMatchObject({ code: '42501' });
        await roleClient.query('RESET ROLE');
      } finally {
        roleClient.release();
      }
    });
  });
});
