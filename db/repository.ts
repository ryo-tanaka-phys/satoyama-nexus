import type { Pool } from 'pg';
import type {
  Activity,
  ActivityLocation,
  Actor,
  ActorRevision,
  ActorSourceAssertion,
  AIRecommendationRecord,
  AtomicCaseMutation,
  AuditEvent,
  CaseGovernanceRecord,
  CollaborationCase,
  LocationPrecision,
  M1DomainRepository,
  ParticipationCondition,
  PersistedM1Snapshot,
  ResourceRequirement,
  ReviewRecord,
  SourceAssertion,
  SourceDocument,
  SpatialDistanceQueryResult
} from '../packages/domain/src';
import { assertAuditEventSanitized } from '../packages/domain/src/auth-review-audit';

/**
 * Provisions a least-privilege NOLOGIN application role for simulation/audit testing (D06/D08):
 * - public_catalog: read-only (SELECT only)
 * - simulation.review_record & ops_audit.audit_event: append-only (SELECT, INSERT; NO UPDATE/DELETE)
 */
export async function provisionSimulationAppRole(pool: Pool, roleName: string): Promise<void> {
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(roleName)) {
    throw new Error(`Invalid role identifier: ${roleName}`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN
          CREATE ROLE ${roleName} NOLOGIN;
        END IF;
      END $$;
    `);
    await client.query(`REVOKE ALL ON SCHEMA public_catalog, simulation, ops_audit FROM ${roleName}`);
    await client.query(`GRANT USAGE ON SCHEMA public_catalog, simulation, ops_audit TO ${roleName}`);
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public_catalog TO ${roleName}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE ON simulation.actor, simulation.activity, simulation.activity_revision, simulation.collaboration_case, simulation.case_party, simulation.case_governance, simulation.ai_recommendation TO ${roleName}`
    );
    await client.query(`GRANT SELECT, INSERT ON simulation.review_record TO ${roleName}`);
    await client.query(`GRANT SELECT, INSERT ON ops_audit.audit_event, ops_audit.processed_operation TO ${roleName}`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export class PgM1Repository implements M1DomainRepository {
  constructor(private readonly pool: Pool) {}

  async saveSourceDocument(s: SourceDocument): Promise<void> {
    await this.pool.query(
      `INSERT INTO public_catalog.source_document
         (id, url, publisher, title, accessed_on, published_on, updated_on, summary, url_status, usage_status, usage_evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        s.id,
        s.url,
        s.publisher,
        s.title,
        s.accessedOn,
        s.publishedOn,
        s.updatedOn,
        s.summary,
        s.urlStatus,
        s.usage.status,
        s.usage.evidence
      ]
    );
  }

  async savePublicActivityRevision(activity: Activity, assertions: readonly SourceAssertion[]): Promise<void> {
    if (activity.domain !== 'public-catalog') throw new Error('Public activity required');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO public_catalog.activity (id, current_revision, title)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET current_revision = EXCLUDED.current_revision, title = EXCLUDED.title
         WHERE public_catalog.activity.current_revision < EXCLUDED.current_revision`,
        [activity.id, activity.revision, activity.title]
      );
      await client.query(
        `INSERT INTO public_catalog.activity_revision (id, revision, title) VALUES ($1, $2, $3)`,
        [activity.id, activity.revision, activity.title]
      );
      for (const a of assertions) {
        await client.query(
          `INSERT INTO public_catalog.source_assertion
             (id, activity_id, activity_revision, field, source_id, value, status, checked_by, checked_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            a.id,
            a.target.activityId,
            a.target.revision,
            a.target.field,
            a.sourceId,
            a.value,
            a.status,
            a.checkedBy,
            a.checkedAt
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async savePublicActorRevision(revision: ActorRevision, assertions: readonly ActorSourceAssertion[]): Promise<void> {
    if (revision.actor.domain !== 'public-catalog') throw new Error('Public actor required');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO public_catalog.actor (id, kind, current_revision, display_name, expertise)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (id) DO UPDATE
         SET current_revision = EXCLUDED.current_revision,
             display_name = EXCLUDED.display_name,
             expertise = EXCLUDED.expertise
         WHERE public_catalog.actor.current_revision < EXCLUDED.current_revision`,
        [
          revision.actor.id,
          revision.actor.kind,
          revision.revision,
          revision.actor.displayName,
          JSON.stringify(revision.actor.expertise)
        ]
      );
      await client.query(
        `INSERT INTO public_catalog.actor_revision (actor_id, revision, kind, display_name, expertise)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          revision.actor.id,
          revision.revision,
          revision.actor.kind,
          revision.actor.displayName,
          JSON.stringify(revision.actor.expertise)
        ]
      );
      for (const a of assertions) {
        await client.query(
          `INSERT INTO public_catalog.actor_source_assertion
             (id, actor_id, actor_revision, field, source_id, value, status, checked_by, checked_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            a.id,
            a.target.actorId,
            a.target.revision,
            a.target.field,
            a.sourceId,
            a.value,
            a.status,
            a.checkedBy,
            a.checkedAt
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async saveActivityLocation(loc: ActivityLocation): Promise<void> {
    if (loc.coordinates === null) {
      await this.pool.query(
        `INSERT INTO public_catalog.activity_location
           (id, activity_id, activity_revision, label, coordinates, precision, public_granularity, acquisition_basis, confirmed_on, source_id)
         VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9)`,
        [
          loc.id,
          loc.activityId,
          loc.activityRevision,
          loc.label,
          loc.precision,
          loc.publicGranularity,
          loc.acquisitionBasis,
          loc.confirmedOn,
          loc.sourceId
        ]
      );
    } else {
      await this.pool.query(
        `INSERT INTO public_catalog.activity_location
           (id, activity_id, activity_revision, label, coordinates, precision, public_granularity, acquisition_basis, confirmed_on, source_id)
         VALUES ($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7,$8,$9,$10,$11)`,
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
          loc.confirmedOn,
          loc.sourceId
        ]
      );
    }
  }

  async saveParticipationCondition(cond: ParticipationCondition): Promise<void> {
    await this.pool.query(
      `INSERT INTO public_catalog.participation_condition (id, activity_id, activity_revision, time_zone, payload, source_id)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [
        cond.id,
        cond.target.activityId,
        cond.target.activityRevision,
        cond.schedule.timeZone,
        JSON.stringify(cond),
        cond.sourceId
      ]
    );
  }

  async saveResourceRequirement(req: ResourceRequirement): Promise<void> {
    if (req.owner.kind !== 'activity') {
      throw new Error('Only public activity resource requirements are persisted in public_catalog.resource_requirement');
    }
    await this.pool.query(
      `INSERT INTO public_catalog.resource_requirement
         (id, activity_id, activity_revision, category, title, quantity, required, note, source_id)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
      [
        req.id,
        req.owner.id,
        req.owner.revision,
        req.category,
        req.title,
        JSON.stringify(req.quantity),
        req.required,
        req.note,
        req.sourceId
      ]
    );
  }

  async saveSimulationActor(actor: Actor): Promise<void> {
    if (actor.domain !== 'simulation') throw new Error('Simulation actor required');
    await this.pool.query(
      `INSERT INTO simulation.actor (id, kind, display_name, expertise) VALUES ($1,$2,$3,$4::jsonb)`,
      [actor.id, actor.kind, actor.displayName, JSON.stringify(actor.expertise)]
    );
  }

  async saveSimulationActivityRevision(activity: Activity): Promise<void> {
    if (activity.domain !== 'simulation') throw new Error('Simulation activity required');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO simulation.activity (id, current_revision, title) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET current_revision = EXCLUDED.current_revision, title = EXCLUDED.title`,
        [activity.id, activity.revision, activity.title]
      );
      await client.query(
        `INSERT INTO simulation.activity_revision (id, revision, title) VALUES ($1,$2,$3)`,
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

  async saveCollaborationCase(
    value: CollaborationCase,
    governance: CaseGovernanceRecord,
    aiRecommendations: readonly AIRecommendationRecord[] = []
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const isPublic = value.activity.domain === 'public-catalog';
      await client.query(
        `INSERT INTO simulation.collaboration_case
           (id, mode, public_activity_id, public_activity_revision, simulated_activity_id, simulated_activity_revision, revision, stage)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          value.id,
          value.mode,
          isPublic ? value.activity.id : null,
          isPublic ? value.activity.revision : null,
          isPublic ? null : value.activity.id,
          isPublic ? null : value.activity.revision,
          value.revision,
          value.stage
        ]
      );
      for (const p of value.parties) {
        await client.query(
          `INSERT INTO simulation.case_party (case_id, actor_id, role) VALUES ($1,$2,$3)`,
          [value.id, p.actorId, p.role]
        );
      }
      await client.query(
        `INSERT INTO simulation.case_governance
           (case_id, created_by_account_id, last_material_change_by_account_id, last_material_change_revision)
         VALUES ($1,$2,$3,$4)`,
        [
          governance.caseId,
          governance.createdByAccountId,
          governance.lastMaterialChangeByAccountId,
          governance.lastMaterialChangeRevision
        ]
      );
      for (const rec of aiRecommendations) {
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
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Computes PostGIS geography distance in meters while preserving location precision
   * and returning distanceMeters=null for missing locations (D05).
   */
  async queryLocationsByDistance(params: {
    latitude: number;
    longitude: number;
    maxDistanceMeters?: number;
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
       FROM public_catalog.activity_location
       WHERE ($3::double precision IS NULL)
          OR coordinates IS NULL
          OR ST_DWithin(coordinates, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
       ORDER BY distance_meters ASC NULLS LAST, id ASC`,
      [params.longitude, params.latitude, params.maxDistanceMeters ?? null]
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

  /**
   * Atomically commits case version/stage updates, optional append-only ReviewRecord,
   * operationId idempotency record, and sanitized AuditEvent in one PostgreSQL transaction.
   */
  async commitAtomicCaseMutation(
    mutation: AtomicCaseMutation
  ): Promise<{ applied: true; idempotentReplay: boolean } | { applied: false; reason: 'VERSION_CONFLICT' }> {
    assertAuditEventSanitized(mutation.auditEvent);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const opCheck = await client.query<{ operation_id: string }>(
        'SELECT operation_id FROM ops_audit.processed_operation WHERE operation_id = $1 FOR UPDATE',
        [mutation.operationId]
      );
      if (opCheck.rows.length > 0) {
        await client.query('COMMIT');
        return { applied: true, idempotentReplay: true };
      }

      const upd = await client.query(
        `UPDATE simulation.collaboration_case
         SET revision = $1, stage = $2
         WHERE id = $3 AND revision = $4`,
        [mutation.nextRevision, mutation.nextStage, mutation.caseId, mutation.expectedVersion]
      );
      if (upd.rowCount !== 1) {
        await client.query('ROLLBACK');
        return { applied: false, reason: 'VERSION_CONFLICT' };
      }

      if (mutation.reviewRecord) {
        const rev = mutation.reviewRecord;
        await client.query(
          `INSERT INTO simulation.review_record
             (id, case_id, case_revision, ai_recommendation_id, ai_recommendation_version,
              reviewer_account_id, permission_scope, decision, reason, reviewed_at, policy_version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            rev.id,
            rev.caseId,
            rev.caseRevision,
            rev.aiRecommendationId,
            rev.aiRecommendationVersion,
            rev.reviewerAccountId,
            rev.permissionScope,
            rev.decision,
            rev.reason,
            rev.reviewedAt,
            rev.policyVersion
          ]
        );
      }

      if (mutation.beforeAuditCommit) {
        await mutation.beforeAuditCommit();
      }

      await client.query('INSERT INTO ops_audit.processed_operation (operation_id) VALUES ($1)', [mutation.operationId]);
      const ev = mutation.auditEvent;
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
      return { applied: true, idempotentReplay: false };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async appendDeniedAuditEvent(ev: AuditEvent): Promise<void> {
    assertAuditEventSanitized(ev);
    await this.pool.query(
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
  }

  async loadSnapshot(): Promise<PersistedM1Snapshot> {
    const [
      sourcesRes,
      pubActRes,
      pubActRevRes,
      pubAsrtRes,
      pubActorRes,
      pubActorRevRes,
      pubActorAsrtRes,
      locRes,
      condRes,
      reqRes,
      simActorRes,
      simActRes,
      caseRes,
      partyRes,
      govRes,
      aiRecRes,
      revRes,
      auditRes
    ] = await Promise.all([
      this.pool.query<Record<string, unknown>>('SELECT id, url, publisher, title, to_char(accessed_on, \'YYYY-MM-DD\') AS accessed_on, to_char(published_on, \'YYYY-MM-DD\') AS published_on, to_char(updated_on, \'YYYY-MM-DD\') AS updated_on, summary, url_status, usage_status, usage_evidence FROM public_catalog.source_document ORDER BY id'),
      this.pool.query<Record<string, unknown>>('SELECT id, current_revision, title FROM public_catalog.activity ORDER BY id'),
      this.pool.query<Record<string, unknown>>('SELECT id, revision, title FROM public_catalog.activity_revision ORDER BY id, revision'),
      this.pool.query<Record<string, unknown>>('SELECT id, activity_id, activity_revision, field, source_id, value, status, checked_by, checked_at FROM public_catalog.source_assertion ORDER BY id'),
      this.pool.query<Record<string, unknown>>('SELECT id, kind, display_name, expertise FROM public_catalog.actor ORDER BY id'),
      this.pool.query<Record<string, unknown>>('SELECT actor_id, revision, kind, display_name, expertise FROM public_catalog.actor_revision ORDER BY actor_id, revision'),
      this.pool.query<Record<string, unknown>>('SELECT id, actor_id, actor_revision, field, source_id, value, status, checked_by, checked_at FROM public_catalog.actor_source_assertion ORDER BY id'),
      this.pool.query<Record<string, unknown>>('SELECT id, activity_id, activity_revision, label, CASE WHEN coordinates IS NULL THEN NULL ELSE ST_Y(coordinates::geometry) END AS lat, CASE WHEN coordinates IS NULL THEN NULL ELSE ST_X(coordinates::geometry) END AS lon, precision, public_granularity, acquisition_basis, to_char(confirmed_on, \'YYYY-MM-DD\') AS confirmed_on, source_id FROM public_catalog.activity_location ORDER BY id'),
      this.pool.query<Record<string, unknown>>('SELECT payload FROM public_catalog.participation_condition ORDER BY id'),
      this.pool.query<Record<string, unknown>>('SELECT id, activity_id, activity_revision, category, title, quantity, required, note, source_id FROM public_catalog.resource_requirement ORDER BY id'),
      this.pool.query<Record<string, unknown>>('SELECT id, kind, display_name, expertise FROM simulation.actor ORDER BY id'),
      this.pool.query<Record<string, unknown>>('SELECT id, current_revision, title FROM simulation.activity ORDER BY id'),
      this.pool.query<Record<string, unknown>>('SELECT id, mode, public_activity_id, public_activity_revision, simulated_activity_id, simulated_activity_revision, revision, stage FROM simulation.collaboration_case ORDER BY id'),
      this.pool.query<Record<string, unknown>>('SELECT case_id, actor_id, role FROM simulation.case_party ORDER BY case_id, actor_id'),
      this.pool.query<Record<string, unknown>>('SELECT case_id, created_by_account_id, last_material_change_by_account_id, last_material_change_revision FROM simulation.case_governance ORDER BY case_id'),
      this.pool.query<Record<string, unknown>>('SELECT id, case_id, case_revision, model, prompt_version, rationale, constraints, generated_at, status FROM simulation.ai_recommendation ORDER BY id'),
      this.pool.query<Record<string, unknown>>('SELECT id, case_id, case_revision, ai_recommendation_id, ai_recommendation_version, reviewer_account_id, permission_scope, decision, reason, reviewed_at, policy_version FROM simulation.review_record ORDER BY reviewed_at, id'),
      this.pool.query<Record<string, unknown>>('SELECT id, operation_id, actor_account_id, action, target_id, target_revision, outcome, reason_code, occurred_at, correlation_id, diff_summary FROM ops_audit.audit_event ORDER BY occurred_at, id')
    ]);

    const partiesByCase = new Map<string, { actorId: string; role: string }[]>();
    for (const p of partyRes.rows) {
      const cid = String(p.case_id);
      const arr = partiesByCase.get(cid) ?? [];
      arr.push({ actorId: String(p.actor_id), role: String(p.role) });
      partiesByCase.set(cid, arr);
    }

    return {
      sources: sourcesRes.rows.map((r) => ({
        id: String(r.id),
        url: String(r.url),
        publisher: String(r.publisher),
        title: String(r.title),
        accessedOn: String(r.accessed_on),
        publishedOn: r.published_on ? String(r.published_on) : null,
        updatedOn: r.updated_on ? String(r.updated_on) : null,
        summary: String(r.summary),
        urlStatus: r.url_status as SourceDocument['urlStatus'],
        usage: {
          status: r.usage_status as SourceDocument['usage']['status'],
          evidence: r.usage_evidence ? String(r.usage_evidence) : null
        }
      })),
      publicActivities: pubActRes.rows.map((r) => ({
        id: String(r.id),
        domain: 'public-catalog' as const,
        revision: Number(r.current_revision),
        title: String(r.title)
      })),
      publicActivityRevisions: pubActRevRes.rows.map((r) => ({
        id: String(r.id),
        domain: 'public-catalog' as const,
        revision: Number(r.revision),
        title: String(r.title)
      })),
      publicAssertions: pubAsrtRes.rows.map((r) => ({
        id: String(r.id),
        target: {
          activityId: String(r.activity_id),
          revision: Number(r.activity_revision),
          field: r.field as SourceAssertion['target']['field']
        },
        sourceId: String(r.source_id),
        value: String(r.value),
        status: r.status as SourceAssertion['status'],
        checkedBy: r.checked_by ? String(r.checked_by) : null,
        checkedAt: r.checked_at instanceof Date ? r.checked_at.toISOString() : r.checked_at ? String(r.checked_at) : null
      })),
      publicActors: pubActorRes.rows.map((r) => ({
        id: String(r.id),
        domain: 'public-catalog' as const,
        kind: r.kind as Actor['kind'],
        displayName: String(r.display_name),
        expertise: r.expertise as Actor['expertise']
      })),
      publicActorRevisions: pubActorRevRes.rows.map((r) => ({
        revision: Number(r.revision),
        actor: {
          id: String(r.actor_id),
          domain: 'public-catalog' as const,
          kind: r.kind as Actor['kind'],
          displayName: String(r.display_name),
          expertise: r.expertise as Actor['expertise']
        }
      })),
      publicActorAssertions: pubActorAsrtRes.rows.map((r) => ({
        id: String(r.id),
        target: {
          actorId: String(r.actor_id),
          revision: Number(r.actor_revision),
          field: r.field as ActorSourceAssertion['target']['field']
        },
        sourceId: String(r.source_id),
        value: String(r.value),
        status: r.status as ActorSourceAssertion['status'],
        checkedBy: r.checked_by ? String(r.checked_by) : null,
        checkedAt: r.checked_at instanceof Date ? r.checked_at.toISOString() : r.checked_at ? String(r.checked_at) : null
      })),
      locations: locRes.rows.map((r) => ({
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
        sourceId: String(r.source_id)
      })),
      participationConditions: condRes.rows.map((r) => r.payload as ParticipationCondition),
      resourceRequirements: reqRes.rows.map((r) => ({
        id: String(r.id),
        owner: { kind: 'activity' as const, id: String(r.activity_id), revision: Number(r.activity_revision) },
        category: r.category as ResourceRequirement['category'],
        title: String(r.title),
        quantity: r.quantity as ResourceRequirement['quantity'],
        required: Boolean(r.required),
        note: r.note ? String(r.note) : null,
        sourceId: String(r.source_id)
      })),
      simulationActors: simActorRes.rows.map((r) => ({
        id: String(r.id),
        domain: 'simulation' as const,
        kind: r.kind as Actor['kind'],
        displayName: String(r.display_name),
        expertise: r.expertise as Actor['expertise']
      })),
      simulationActivities: simActRes.rows.map((r) => ({
        id: String(r.id),
        domain: 'simulation' as const,
        revision: Number(r.current_revision),
        title: String(r.title)
      })),
      cases: caseRes.rows.map((r) => ({
        mode: 'simulation' as const,
        id: String(r.id),
        activity: r.public_activity_id
          ? { id: String(r.public_activity_id), domain: 'public-catalog' as const, revision: Number(r.public_activity_revision) }
          : { id: String(r.simulated_activity_id), domain: 'simulation' as const, revision: Number(r.simulated_activity_revision) },
        revision: Number(r.revision),
        stage: r.stage as CollaborationCase['stage'],
        parties: partiesByCase.get(String(r.id)) ?? []
      })),
      caseGovernance: govRes.rows.map((r) => ({
        caseId: String(r.case_id),
        createdByAccountId: String(r.created_by_account_id),
        lastMaterialChangeByAccountId: r.last_material_change_by_account_id ? String(r.last_material_change_by_account_id) : null,
        lastMaterialChangeRevision: Number(r.last_material_change_revision)
      })),
      aiRecommendations: aiRecRes.rows.map((r) => ({
        id: String(r.id),
        caseId: String(r.case_id),
        caseRevision: Number(r.case_revision),
        model: String(r.model),
        promptVersion: String(r.prompt_version),
        rationale: String(r.rationale),
        constraints: r.constraints as string[],
        generatedAt: r.generated_at instanceof Date ? r.generated_at.toISOString() : String(r.generated_at),
        status: 'requires-human-review' as const
      })),
      reviewRecords: revRes.rows.map((r) => ({
        id: String(r.id),
        caseId: String(r.case_id),
        caseRevision: Number(r.case_revision),
        aiRecommendationId: r.ai_recommendation_id ? String(r.ai_recommendation_id) : null,
        aiRecommendationVersion: r.ai_recommendation_version ? String(r.ai_recommendation_version) : null,
        reviewerAccountId: String(r.reviewer_account_id),
        permissionScope: String(r.permission_scope),
        decision: r.decision as ReviewRecord['decision'],
        reason: String(r.reason),
        reviewedAt: r.reviewed_at instanceof Date ? r.reviewed_at.toISOString() : String(r.reviewed_at),
        policyVersion: String(r.policy_version)
      })),
      auditEvents: auditRes.rows.map((r) => ({
        id: String(r.id),
        operationId: String(r.operation_id),
        actorAccountId: r.actor_account_id ? String(r.actor_account_id) : null,
        action: r.action as AuditEvent['action'],
        targetId: String(r.target_id),
        targetRevision: r.target_revision === null ? null : Number(r.target_revision),
        outcome: r.outcome as AuditEvent['outcome'],
        reasonCode: String(r.reason_code),
        occurredAt: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at),
        correlationId: String(r.correlation_id),
        diffSummary: r.diff_summary as AuditEvent['diffSummary']
      }))
    };
  }
}
