import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg, { type Pool } from 'pg';
import {
  assertAuditEventSanitized,
  validateGovernedDomainState,
  type Activity,
  type ActivityLocation,
  type Actor,
  type ActorRevision,
  type AuditEvent,
  type CaseGovernanceRecord,
  type CaseParty,
  type CollaborationCase,
  type CollaborationStage,
  type GovernedDomainState,
  type LocationConditionsGraph,
  type LocationPrecision,
  type ParticipationCondition,
  type ResourceRequirement,
  type ReviewRecord,
  type SpatialDistanceQueryResult
} from '../packages/domain/src';
import type { ActorMatchingProfile } from '../packages/matching/src';
import type { AITriageSignal, StructuredPrimaryAssessment } from '../packages/ai-review/src';
import { applyMigrations, loadMigrationFiles } from './migrator';
import { PgM1Repository } from './repository';

export interface PersistedCollaborationNote {
  id: string;
  mode: 'simulation';
  externalContactSent: false;
  caseId: string;
  caseRevision: number;
  fromStage: CollaborationStage;
  toStage: CollaborationStage;
  actorAccountId: string;
  note: string;
  recordedAt: string;
}

export interface WorkbenchSeedData {
  state: GovernedDomainState;
  actorProfiles: readonly ActorMatchingProfile[];
}

export interface LoadedWorkbenchData {
  state: GovernedDomainState;
  actorProfiles: readonly ActorMatchingProfile[];
  aiAssessments: readonly StructuredPrimaryAssessment[];
  collaborationNotes: readonly PersistedCollaborationNote[];
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
 * PostgreSQL/PostGIS persistence adapter for the Phase 1 M2–M4 simulation workbench.
 * Lives in root db/ so pg resolves cleanly without modifying apps/web/package.json.
 */
export class PgWorkbenchPersistence {
  private readonly repo: PgM1Repository;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {
    this.repo = new PgM1Repository(pool);
  }

  async ensureInitialized(buildSeed: () => WorkbenchSeedData): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.runInitialization(buildSeed).catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    await this.initPromise;
  }

  private async runInitialization(buildSeed: () => WorkbenchSeedData): Promise<void> {
    const migrations = await loadMigrationFiles(resolveMigrationsDir());
    const client = await this.pool.connect();
    try {
      await applyMigrations(client, migrations);
    } finally {
      client.release();
    }

    const existingActors = await this.pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM simulation.actor');
    if (Number(existingActors.rows[0]?.count ?? '0') === 0) {
      const seed = buildSeed();
      await this.seedInitialData(seed);
    }
    this.initialized = true;
  }

  private async seedInitialData(seed: WorkbenchSeedData): Promise<void> {
    for (const actor of seed.state.graph.actors) {
      if (actor.domain !== 'simulation') continue;
      await this.pool.query(
        `INSERT INTO simulation.actor (id, kind, display_name, expertise)
         VALUES ($1,$2,$3,$4::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [actor.id, actor.kind, actor.displayName, JSON.stringify(actor.expertise)]
      );
    }

    for (const prof of seed.actorProfiles) {
      if (prof.baseCoordinates) {
        await this.pool.query(
          `INSERT INTO simulation.actor_profile (actor_id, base_coordinates, available_transport_modes, willingness, note)
           VALUES ($1, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, $4::jsonb, $5, $6)
           ON CONFLICT (actor_id) DO NOTHING`,
          [
            prof.actorId,
            prof.baseCoordinates.longitude,
            prof.baseCoordinates.latitude,
            JSON.stringify(prof.availableTransportModes),
            prof.willingness,
            prof.note ?? null
          ]
        );
      } else {
        await this.pool.query(
          `INSERT INTO simulation.actor_profile (actor_id, base_coordinates, available_transport_modes, willingness, note)
           VALUES ($1, NULL, $2::jsonb, $3, $4)
           ON CONFLICT (actor_id) DO NOTHING`,
          [prof.actorId, JSON.stringify(prof.availableTransportModes), prof.willingness, prof.note ?? null]
        );
      }
    }

    for (const act of seed.state.graph.activities) {
      if (act.domain !== 'simulation') continue;
      await this.saveSimulationActivityRevisionIdempotent(act);
    }

    for (const loc of seed.state.graph.locations) {
      await this.saveSimulationActivityLocation(loc);
    }

    for (const cond of seed.state.graph.participationConditions) {
      await this.saveSimulationParticipationCondition(cond);
    }

    for (const req of seed.state.graph.resourceRequirements) {
      if (req.owner.kind === 'activity') {
        await this.saveSimulationResourceRequirement(req);
      }
    }

    for (const c of seed.state.graph.cases) {
      const gov = seed.state.caseGovernance.find((g) => g.caseId === c.id);
      if (gov) {
        const exists = await this.pool.query('SELECT 1 FROM simulation.collaboration_case WHERE id = $1', [c.id]);
        if (exists.rowCount === 0) {
          await this.repo.saveCollaborationCase(c, gov, []);
        }
      }
    }
  }

  private async saveSimulationActivityRevisionIdempotent(activity: Activity): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO simulation.activity (id, current_revision, title) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET current_revision = EXCLUDED.current_revision, title = EXCLUDED.title`,
        [activity.id, activity.revision, activity.title]
      );
      await client.query(
        `INSERT INTO simulation.activity_revision (id, revision, title) VALUES ($1,$2,$3)
         ON CONFLICT (id, revision) DO NOTHING`,
        [activity.id, activity.revision, activity.title]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async saveSimulationActivityLocation(loc: ActivityLocation): Promise<void> {
    if (loc.coordinates === null) {
      await this.pool.query(
        `INSERT INTO simulation.activity_location
           (id, activity_id, activity_revision, label, coordinates, precision, public_granularity, acquisition_basis, confirmed_on)
         VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [
          loc.id,
          loc.activityId,
          loc.activityRevision,
          loc.label,
          loc.precision,
          loc.publicGranularity,
          loc.acquisitionBasis,
          loc.confirmedOn
        ]
      );
    } else {
      await this.pool.query(
        `INSERT INTO simulation.activity_location
           (id, activity_id, activity_revision, label, coordinates, precision, public_granularity, acquisition_basis, confirmed_on)
         VALUES ($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          loc.id,
          loc.activityId,
          loc.activityRevision,
          loc.label,
          loc.coordinates.longitude,
          loc.coordinates.latitude,
          loc.precision,
          loc.publicGranularity,
          loc.acquisitionBasis,
          loc.confirmedOn
        ]
      );
    }
  }

  async saveSimulationParticipationCondition(cond: ParticipationCondition): Promise<void> {
    await this.pool.query(
      `INSERT INTO simulation.participation_condition (id, activity_id, activity_revision, time_zone, payload)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [cond.id, cond.target.activityId, cond.target.activityRevision, cond.schedule.timeZone, JSON.stringify(cond)]
    );
  }

  async saveSimulationResourceRequirement(req: ResourceRequirement): Promise<void> {
    if (req.owner.kind !== 'activity') return;
    await this.pool.query(
      `INSERT INTO simulation.resource_requirement
         (id, activity_id, activity_revision, category, title, quantity, required, note)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        req.id,
        req.owner.id,
        req.owner.revision,
        req.category,
        req.title,
        JSON.stringify(req.quantity),
        req.required,
        req.note
      ]
    );
  }

  async saveNewSimulationActivityProposal(
    activity: Activity,
    location: ActivityLocation,
    condition: ParticipationCondition
  ): Promise<void> {
    await this.saveSimulationActivityRevisionIdempotent(activity);
    await this.saveSimulationActivityLocation(location);
    await this.saveSimulationParticipationCondition(condition);
  }

  async saveNewCollaborationCase(draft: CollaborationCase, governance: CaseGovernanceRecord): Promise<void> {
    await this.repo.saveCollaborationCase(draft, governance, []);
  }

  async appendAIPrimaryAssessment(assessment: StructuredPrimaryAssessment): Promise<void> {
    const rec = assessment.record;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO simulation.ai_recommendation
           (id, case_id, case_revision, model, prompt_version, rationale, constraints, generated_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [
          rec.id,
          rec.caseId,
          rec.caseRevision,
          rec.model,
          rec.promptVersion,
          rec.rationale,
          JSON.stringify(rec.constraints),
          rec.generatedAt,
          rec.status
        ]
      );
      await client.query(
        `INSERT INTO simulation.ai_assessment_detail
           (recommendation_id, triage_signal, provider, strengths, risks_and_gaps, required_human_checks, uncertainties)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb)`,
        [
          rec.id,
          assessment.triageSignal,
          assessment.provenance.provider,
          JSON.stringify(assessment.strengths),
          JSON.stringify(assessment.risksAndGaps),
          JSON.stringify(assessment.requiredHumanChecks),
          JSON.stringify(assessment.uncertainties)
        ]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async commitHumanReview(params: {
    operationId: string;
    caseId: string;
    expectedVersion: number;
    stage: CollaborationStage;
    reviewRecord: ReviewRecord;
    auditEvent: AuditEvent;
  }): Promise<void> {
    const res = await this.repo.commitAtomicCaseMutation({
      operationId: params.operationId,
      caseId: params.caseId,
      expectedVersion: params.expectedVersion,
      nextRevision: params.expectedVersion,
      nextStage: params.stage,
      reviewRecord: params.reviewRecord,
      auditEvent: params.auditEvent
    });
    if (!res.applied) throw new Error('VERSION_CONFLICT');
  }

  async commitMaterialChange(params: {
    operationId: string;
    caseId: string;
    expectedVersion: number;
    nextRevision: number;
    stage: CollaborationStage;
    governance: CaseGovernanceRecord;
    nextParties: readonly CaseParty[];
    auditEvent: AuditEvent;
  }): Promise<void> {
    assertAuditEventSanitized(params.auditEvent);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const opCheck = await client.query(
        'SELECT operation_id FROM ops_audit.processed_operation WHERE operation_id = $1 FOR UPDATE',
        [params.operationId]
      );
      if (opCheck.rows.length > 0) {
        await client.query('COMMIT');
        return;
      }

      const upd = await client.query(
        `UPDATE simulation.collaboration_case
         SET revision = $1, stage = $2
         WHERE id = $3 AND revision = $4`,
        [params.nextRevision, params.stage, params.caseId, params.expectedVersion]
      );
      if (upd.rowCount !== 1) {
        await client.query('ROLLBACK');
        throw new Error('VERSION_CONFLICT');
      }

      await client.query(
        `UPDATE simulation.case_governance
         SET last_material_change_by_account_id = $1,
             last_material_change_revision = $2
         WHERE case_id = $3`,
        [
          params.governance.lastMaterialChangeByAccountId,
          params.governance.lastMaterialChangeRevision,
          params.caseId
        ]
      );

      for (const p of params.nextParties) {
        await client.query(
          `INSERT INTO simulation.case_party (case_id, actor_id, role)
           VALUES ($1,$2,$3)
           ON CONFLICT (case_id, actor_id) DO UPDATE SET role = EXCLUDED.role`,
          [params.caseId, p.actorId, p.role]
        );
      }

      await client.query('INSERT INTO ops_audit.processed_operation (operation_id) VALUES ($1)', [params.operationId]);
      const ev = params.auditEvent;
      await client.query(
        `INSERT INTO ops_audit.audit_event
           (id, operation_id, actor_account_id, action, target_id, target_revision,
            outcome, reason_code, occurred_at, correlation_id, diff_summary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [
          ev.id,
          ev.operationId,
          ev.actorAccountId,
          ev.action,
          ev.targetId,
          ev.targetRevision,
          ev.outcome,
          ev.reasonCode,
          ev.occurredAt,
          ev.correlationId,
          JSON.stringify(ev.diffSummary)
        ]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async commitStageTransition(params: {
    operationId: string;
    caseId: string;
    expectedVersion: number;
    nextStage: CollaborationStage;
    auditEvent: AuditEvent;
    collaborationNote: PersistedCollaborationNote | null;
  }): Promise<void> {
    assertAuditEventSanitized(params.auditEvent);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const opCheck = await client.query(
        'SELECT operation_id FROM ops_audit.processed_operation WHERE operation_id = $1 FOR UPDATE',
        [params.operationId]
      );
      if (opCheck.rows.length > 0) {
        await client.query('COMMIT');
        return;
      }

      const upd = await client.query(
        `UPDATE simulation.collaboration_case
         SET stage = $1
         WHERE id = $2 AND revision = $3`,
        [params.nextStage, params.caseId, params.expectedVersion]
      );
      if (upd.rowCount !== 1) {
        await client.query('ROLLBACK');
        throw new Error('VERSION_CONFLICT');
      }

      if (params.collaborationNote) {
        const n = params.collaborationNote;
        await client.query(
          `INSERT INTO simulation.collaboration_note
             (id, mode, external_contact_sent, case_id, case_revision, from_stage, to_stage, actor_account_id, note, recorded_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            n.id,
            n.mode,
            n.externalContactSent,
            n.caseId,
            n.caseRevision,
            n.fromStage,
            n.toStage,
            n.actorAccountId,
            n.note,
            n.recordedAt
          ]
        );
      }

      await client.query('INSERT INTO ops_audit.processed_operation (operation_id) VALUES ($1)', [params.operationId]);
      const ev = params.auditEvent;
      await client.query(
        `INSERT INTO ops_audit.audit_event
           (id, operation_id, actor_account_id, action, target_id, target_revision,
            outcome, reason_code, occurred_at, correlation_id, diff_summary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [
          ev.id,
          ev.operationId,
          ev.actorAccountId,
          ev.action,
          ev.targetId,
          ev.targetRevision,
          ev.outcome,
          ev.reasonCode,
          ev.occurredAt,
          ev.correlationId,
          JSON.stringify(ev.diffSummary)
        ]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async appendDeniedAudit(event: AuditEvent): Promise<void> {
    await this.repo.appendDeniedAuditEvent(event);
  }

  /** Computes PostGIS ST_Distance for simulation activity locations while preserving null coordinates. */
  async querySimulationLocationsByDistance(params: {
    activityId: string;
    activityRevision: number;
    latitude: number;
    longitude: number;
  }): Promise<readonly SpatialDistanceQueryResult[]> {
    const res = await this.pool.query<{
      id: string;
      activity_id: string;
      activity_revision: number;
      label: string;
      precision: LocationPrecision;
      public_granularity: ActivityLocation['publicGranularity'];
      distance_meters: number | null;
    }>(
      `SELECT id, activity_id, activity_revision, label, precision, public_granularity,
              CASE WHEN coordinates IS NULL THEN NULL
                   ELSE ST_Distance(coordinates, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
              END AS distance_meters
       FROM simulation.activity_location
       WHERE activity_id = $3 AND activity_revision = $4
       ORDER BY distance_meters ASC NULLS LAST, id ASC`,
      [params.longitude, params.latitude, params.activityId, params.activityRevision]
    );
    return res.rows.map((r) => ({
      locationId: r.id,
      activityId: r.activity_id,
      activityRevision: r.activity_revision,
      label: r.label,
      precision: r.precision,
      publicGranularity: r.public_granularity,
      distanceMeters: r.distance_meters === null ? null : Number(r.distance_meters)
    }));
  }

  async loadAll(): Promise<LoadedWorkbenchData> {
    const m1Snap = await this.repo.loadSnapshot();
    const [
      simActRevRes,
      simLocRes,
      simCondRes,
      simReqRes,
      actorProfRes,
      aiDetailRes,
      notesRes,
      processedOpsRes
    ] = await Promise.all([
      this.pool.query<Record<string, unknown>>(
        'SELECT id, revision, title FROM simulation.activity_revision ORDER BY id, revision'
      ),
      this.pool.query<Record<string, unknown>>(
        `SELECT id, activity_id, activity_revision, label,
                CASE WHEN coordinates IS NULL THEN NULL ELSE ST_Y(coordinates::geometry) END AS lat,
                CASE WHEN coordinates IS NULL THEN NULL ELSE ST_X(coordinates::geometry) END AS lon,
                precision, public_granularity, acquisition_basis,
                to_char(confirmed_on, 'YYYY-MM-DD') AS confirmed_on
         FROM simulation.activity_location ORDER BY id`
      ),
      this.pool.query<Record<string, unknown>>('SELECT payload FROM simulation.participation_condition ORDER BY id'),
      this.pool.query<Record<string, unknown>>(
        'SELECT id, activity_id, activity_revision, category, title, quantity, required, note FROM simulation.resource_requirement ORDER BY id'
      ),
      this.pool.query<Record<string, unknown>>(
        `SELECT actor_id,
                CASE WHEN base_coordinates IS NULL THEN NULL ELSE ST_Y(base_coordinates::geometry) END AS lat,
                CASE WHEN base_coordinates IS NULL THEN NULL ELSE ST_X(base_coordinates::geometry) END AS lon,
                available_transport_modes, willingness, note
         FROM simulation.actor_profile ORDER BY actor_id`
      ),
      this.pool.query<Record<string, unknown>>(
        'SELECT recommendation_id, triage_signal, provider, strengths, risks_and_gaps, required_human_checks, uncertainties FROM simulation.ai_assessment_detail'
      ),
      this.pool.query<Record<string, unknown>>(
        'SELECT id, mode, external_contact_sent, case_id, case_revision, from_stage, to_stage, actor_account_id, note, recorded_at FROM simulation.collaboration_note ORDER BY recorded_at, id'
      ),
      this.pool.query<{ operation_id: string }>('SELECT operation_id FROM ops_audit.processed_operation ORDER BY recorded_at, operation_id')
    ]);

    const allActors: Actor[] = [...m1Snap.publicActors, ...m1Snap.simulationActors];
    const simActorRevisions: ActorRevision[] = m1Snap.simulationActors.map((actor) => ({ actor, revision: 1 }));
    const simActivityRevisions: Activity[] = simActRevRes.rows.map((r) => ({
      id: String(r.id),
      domain: 'simulation' as const,
      revision: Number(r.revision),
      title: String(r.title)
    }));

    const simLocations: ActivityLocation[] = simLocRes.rows.map((r) => ({
      id: String(r.id),
      activityId: String(r.activity_id),
      activityRevision: Number(r.activity_revision),
      label: String(r.label),
      coordinates:
        r.lat === null || r.lon === null
          ? null
          : { srid: 4326 as const, latitude: Number(r.lat), longitude: Number(r.lon) },
      precision: r.precision as LocationPrecision,
      publicGranularity: r.public_granularity as ActivityLocation['publicGranularity'],
      acquisitionBasis: String(r.acquisition_basis),
      confirmedOn: r.confirmed_on ? String(r.confirmed_on) : null,
      sourceId: null
    }));

    const simConditions: ParticipationCondition[] = simCondRes.rows.map((r) => r.payload as ParticipationCondition);
    const simRequirements: ResourceRequirement[] = simReqRes.rows.map((r) => ({
      id: String(r.id),
      owner: { kind: 'activity' as const, id: String(r.activity_id), revision: Number(r.activity_revision) },
      category: r.category as ResourceRequirement['category'],
      title: String(r.title),
      quantity: r.quantity as ResourceRequirement['quantity'],
      required: Boolean(r.required),
      note: r.note ? String(r.note) : null,
      sourceId: null
    }));

    const graph: LocationConditionsGraph = {
      actors: allActors,
      memberships: [],
      activities: [...m1Snap.publicActivities, ...m1Snap.simulationActivities],
      activityRevisions: [...m1Snap.publicActivityRevisions, ...simActivityRevisions],
      activityParties: [],
      cases: m1Snap.cases,
      interests: [],
      needs: [],
      sources: m1Snap.sources,
      assertions: m1Snap.publicAssertions,
      actorRevisions: [...m1Snap.publicActorRevisions, ...simActorRevisions],
      actorAssertions: m1Snap.publicActorAssertions,
      locations: [...m1Snap.locations, ...simLocations],
      participationConditions: [...m1Snap.participationConditions, ...simConditions],
      resourceRequirements: [...m1Snap.resourceRequirements, ...simRequirements],
      actorSkills: []
    };

    const state: GovernedDomainState = {
      graph,
      caseGovernance: m1Snap.caseGovernance,
      aiRecommendations: m1Snap.aiRecommendations,
      reviewRecords: m1Snap.reviewRecords,
      auditEvents: m1Snap.auditEvents,
      processedOperationIds: processedOpsRes.rows.map((r) => r.operation_id)
    };
    validateGovernedDomainState(state);

    const actorProfiles: ActorMatchingProfile[] = actorProfRes.rows.map((r) => ({
      actorId: String(r.actor_id),
      baseCoordinates:
        r.lat === null || r.lon === null
          ? null
          : { srid: 4326 as const, latitude: Number(r.lat), longitude: Number(r.lon) },
      availableTransportModes: (r.available_transport_modes as string[]) ?? [],
      willingness: r.willingness as ActorMatchingProfile['willingness'],
      note: r.note ? String(r.note) : null
    }));

    const detailMap = new Map(aiDetailRes.rows.map((r) => [String(r.recommendation_id), r]));
    const casesById = new Map(m1Snap.cases.map((c) => [c.id, c]));
    const aiAssessments: StructuredPrimaryAssessment[] = m1Snap.aiRecommendations.map((rec) => {
      const detail = detailMap.get(rec.id);
      const targetCase = casesById.get(rec.caseId);
      return {
        mode: 'simulation-ai-primary',
        status: 'requires-human-review',
        canApprove: false,
        canTransition: false,
        qualificationVerified: false,
        impliesAgreement: false,
        triageSignal: (detail?.triage_signal as AITriageSignal) ?? 'caution-human-review',
        caseId: rec.caseId,
        caseRevision: rec.caseRevision,
        activityId: targetCase?.activity.id ?? '',
        activityRevision: targetCase?.activity.revision ?? 1,
        record: rec,
        strengths: (detail?.strengths as string[]) ?? [],
        risksAndGaps: (detail?.risks_and_gaps as string[]) ?? [],
        requiredHumanChecks: (detail?.required_human_checks as string[]) ?? [],
        uncertainties: (detail?.uncertainties as string[]) ?? [],
        provenance: {
          provider: detail?.provider ? String(detail.provider) : 'deterministic-local-reviewer',
          model: rec.model,
          promptVersion: rec.promptVersion,
          generatedAt: rec.generatedAt,
          externalApiCalled: false
        },
        disclaimers: [
          'AI一次推奨の結果だけで模擬依頼・調整・合意へ進めることはできません。',
          '案件に重要変更が入った場合（revision 更新）、過去の承認は失効し再審査が必要です。'
        ]
      };
    });

    const collaborationNotes: PersistedCollaborationNote[] = notesRes.rows.map((r) => ({
      id: String(r.id),
      mode: 'simulation' as const,
      externalContactSent: false as const,
      caseId: String(r.case_id),
      caseRevision: Number(r.case_revision),
      fromStage: r.from_stage as CollaborationStage,
      toStage: r.to_stage as CollaborationStage,
      actorAccountId: String(r.actor_account_id),
      note: String(r.note),
      recordedAt: r.recorded_at instanceof Date ? r.recorded_at.toISOString() : String(r.recorded_at)
    }));

    return { state, actorProfiles, aiAssessments, collaborationNotes };
  }
}

export function createPgPoolForWorkbench(connectionString: string): Pool {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 10_000 });
  pool.on('error', (err: Error & { code?: string }) => {
    if (err.code !== '57P01') {
      // Surface unexpected pool errors without leaking connection strings
      console.error('PostgreSQL pool error:', err.message);
    }
  });
  return pool;
}
