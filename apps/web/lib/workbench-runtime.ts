import type { Pool } from 'pg';
import {
  applyMaterialCaseChange,
  createCollaborationDraft,
  exportCatalogWithActors,
  recordHumanReview,
  transitionSimulationCase,
  validateGovernedDomainState,
  type Activity,
  type ActivityLocation,
  type AuditEvent,
  type CollaborationStage,
  type GovernedDomainState,
  type MaterialChangeKind,
  type ParticipationCondition,
  type SpatialDistanceQueryResult
} from '@satoyama/domain';
import {
  DEFAULT_PROVISIONAL_MATCHING_POLICY,
  recommendSimulationCandidates,
  type MatchRecommendation
} from '@satoyama/matching';
import {
  appendAIRecommendation,
  deterministicPrimaryReviewer,
  getCaseReviewReadiness,
  type CaseReviewReadiness,
  type StructuredPrimaryAssessment
} from '@satoyama/ai-review';
import publicActivitiesFixture from '../../../data/fixtures/public-activities.json';
import {
  createPgPoolForWorkbench,
  PgWorkbenchPersistence,
  type LoadedWorkbenchData,
  type PersistedCollaborationNote
} from '../../../db/workbench-store';
import {
  buildInitialSeed,
  DEMO_PERSONAS,
  getWorkbench,
  resolveServerAuthContext,
  type DemoPersonaId,
  type WorkbenchSnapshot
} from './simulation-store';

export interface ActiveWorkbench {
  getSnapshot(selectedActivityId?: string): Promise<WorkbenchSnapshot>;
  createActivityProposal(
    personaId: DemoPersonaId,
    input: {
      title: string;
      locationLabel: string;
      latitude?: number | null;
      longitude?: number | null;
      requiredSkills: readonly string[];
      transportModes: readonly string[];
      itemsToConfirm?: readonly string[];
      scheduleStartAt?: string | null;
    }
  ): Promise<{ ok: true; activity: Activity; snapshot: WorkbenchSnapshot } | { ok: false; reasonCode: string; message: string }>;
  createDraftCase(
    personaId: DemoPersonaId,
    input: { activityId: string; candidateActorId: string; role?: string }
  ): Promise<{ ok: true; caseId: string; snapshot: WorkbenchSnapshot } | { ok: false; reasonCode: string; message: string }>;
  runAIPrimaryReview(
    caseId: string
  ): Promise<
    | { ok: true; assessment: StructuredPrimaryAssessment; snapshot: WorkbenchSnapshot }
    | { ok: false; reasonCode: string; message: string }
  >;
  submitHumanReview(
    personaId: DemoPersonaId,
    input: {
      caseId: string;
      expectedVersion: number;
      decision: 'approved' | 'rejected';
      reason: string;
      aiRecommendationId?: string | null;
      policyVersion?: string;
    }
  ): Promise<
    | { ok: true; auditEvent: AuditEvent; snapshot: WorkbenchSnapshot }
    | { ok: false; reasonCode: string; message: string; deniedAuditEvent: AuditEvent; snapshot: WorkbenchSnapshot }
  >;
  applyMaterialChange(
    personaId: DemoPersonaId,
    input: {
      caseId: string;
      expectedVersion: number;
      changeKind: MaterialChangeKind;
      changeSummary: string;
      addActorId?: string;
    }
  ): Promise<
    | { ok: true; auditEvent: AuditEvent; snapshot: WorkbenchSnapshot }
    | { ok: false; reasonCode: string; message: string; deniedAuditEvent: AuditEvent; snapshot: WorkbenchSnapshot }
  >;
  advanceCaseStage(
    personaId: DemoPersonaId,
    input: {
      caseId: string;
      expectedVersion: number;
      targetStage: CollaborationStage;
      simulationNote?: string;
    }
  ): Promise<
    | { ok: true; auditEvent: AuditEvent; snapshot: WorkbenchSnapshot }
    | { ok: false; reasonCode: string; message: string; deniedAuditEvent: AuditEvent; snapshot: WorkbenchSnapshot }
  >;
  reset(): Promise<
    | { ok: true; snapshot: WorkbenchSnapshot }
    | { ok: false; reasonCode: string; message: string; snapshot: WorkbenchSnapshot }
  >;
}

/**
 * PostGIS-backed implementation of the Phase 1 M2–M4 simulation workbench.
 * Persists all domain mutations and audits in PostgreSQL and computes distances with PostGIS ST_Distance.
 */
export class PgSimulationWorkbench implements ActiveWorkbench {
  private readonly store: PgWorkbenchPersistence;
  private readonly clockOverride?: () => string;

  constructor(pool: Pool, options?: { now?: () => string }) {
    this.store = new PgWorkbenchPersistence(pool);
    this.clockOverride = options?.now;
  }

  private nowIso(): string {
    return this.clockOverride ? this.clockOverride() : new Date().toISOString();
  }

  private nextOpId(prefix: string, state: GovernedDomainState): string {
    return `${prefix}-${state.auditEvents.length + 1}-${Date.now().toString(36)}`;
  }

  private async loadReady(): Promise<LoadedWorkbenchData> {
    await this.store.ensureInitialized(() => buildInitialSeed());
    return this.store.loadAll();
  }

  private async computePostGISRecommendations(
    data: LoadedWorkbenchData,
    activityId: string
  ): Promise<readonly MatchRecommendation[]> {
    const activity = data.state.graph.activities.find((a) => a.id === activityId);
    if (!activity) return [];

    const precomputedDistancesByActor: Record<string, readonly SpatialDistanceQueryResult[]> = {};
    await Promise.all(
      data.actorProfiles.map(async (profile) => {
        if (!profile.baseCoordinates) return;
        precomputedDistancesByActor[profile.actorId] = await this.store.querySimulationLocationsByDistance({
          activityId: activity.id,
          activityRevision: activity.revision,
          latitude: profile.baseCoordinates.latitude,
          longitude: profile.baseCoordinates.longitude
        });
      })
    );

    return recommendSimulationCandidates({
      graph: data.state.graph,
      activityId: activity.id,
      activityRevision: activity.revision,
      actorProfiles: data.actorProfiles,
      precomputedDistancesByActor,
      policy: DEFAULT_PROVISIONAL_MATCHING_POLICY
    });
  }

  private async buildSnapshot(data: LoadedWorkbenchData, selectedActivityId?: string): Promise<WorkbenchSnapshot> {
    const simActivities = data.state.graph.activities.filter((a) => a.domain === 'simulation');
    const resolvedActivityId =
      selectedActivityId && simActivities.some((a) => a.id === selectedActivityId)
        ? selectedActivityId
        : simActivities[0]?.id ?? '';

    const recommendations = resolvedActivityId
      ? await this.computePostGISRecommendations(data, resolvedActivityId)
      : [];

    const caseReadiness: Record<string, CaseReviewReadiness> = {};
    for (const c of data.state.graph.cases) {
      caseReadiness[c.id] = getCaseReviewReadiness(data.state, c.id);
    }

    return {
      phaseNotice: 'Phase 1：すべての依頼・応答・調整・合意・実施準備は模擬処理です。外部への実連絡・実AI呼出は行いません。',
      persistence: {
        mode: 'postgis',
        spatialEngine: 'PostGIS ST_Distance',
        label: 'PostgreSQL / PostGIS 永続化中（再起動後も履歴・案件を保持）'
      },
      publicCatalog: {
        ...exportCatalogWithActors(data.state.graph),
        fixtureActivityCount: publicActivitiesFixture.length
      },
      personas: DEMO_PERSONAS,
      matchingPolicy: DEFAULT_PROVISIONAL_MATCHING_POLICY,
      selectedActivityId: resolvedActivityId,
      simulationActors: data.state.graph.actors.filter((a) => a.domain === 'simulation'),
      actorProfiles: structuredClone(data.actorProfiles),
      simulationActivities: simActivities,
      locations: structuredClone(data.state.graph.locations),
      participationConditions: structuredClone(data.state.graph.participationConditions),
      resourceRequirements: structuredClone(data.state.graph.resourceRequirements),
      recommendations,
      cases: structuredClone(data.state.graph.cases),
      caseGovernance: structuredClone(data.state.caseGovernance),
      caseReadiness,
      aiRecommendations: structuredClone(data.state.aiRecommendations),
      aiAssessments: structuredClone(data.aiAssessments),
      reviewRecords: structuredClone(data.state.reviewRecords),
      auditEvents: structuredClone(data.state.auditEvents),
      collaborationNotes: structuredClone(data.collaborationNotes)
    };
  }

  async getSnapshot(selectedActivityId?: string): Promise<WorkbenchSnapshot> {
    const data = await this.loadReady();
    return this.buildSnapshot(data, selectedActivityId);
  }

  async createActivityProposal(
    personaId: DemoPersonaId,
    input: {
      title: string;
      locationLabel: string;
      latitude?: number | null;
      longitude?: number | null;
      requiredSkills: readonly string[];
      transportModes: readonly string[];
      itemsToConfirm?: readonly string[];
      scheduleStartAt?: string | null;
    }
  ): Promise<{ ok: true; activity: Activity; snapshot: WorkbenchSnapshot } | { ok: false; reasonCode: string; message: string }> {
    const nowIso = this.nowIso();
    const auth = resolveServerAuthContext(personaId, nowIso);
    if (!auth.authenticated || !auth.grants.some((g) => g.role === 'simulation-editor')) {
      return {
        ok: false,
        reasonCode: auth.authenticated ? 'FORBIDDEN_SCOPE_OR_ROLE' : 'UNAUTHENTICATED',
        message: '模擬活動の提案には simulation-editor 権限のログインが必要です。'
      };
    }

    const title = input.title.trim();
    if (!title) {
      return { ok: false, reasonCode: 'INVALID_ACTIVITY', message: '活動タイトルを入力してください。' };
    }

    const hasLat = typeof input.latitude === 'number' && Number.isFinite(input.latitude);
    const hasLng = typeof input.longitude === 'number' && Number.isFinite(input.longitude);
    if (hasLat !== hasLng) {
      return { ok: false, reasonCode: 'INVALID_LOCATION', message: '緯度と経度は両方入力するか、両方空欄にしてください。' };
    }
    if (
      hasLat &&
      ((input.latitude as number) < -90 ||
        (input.latitude as number) > 90 ||
        (input.longitude as number) < -180 ||
        (input.longitude as number) > 180)
    ) {
      return { ok: false, reasonCode: 'INVALID_LOCATION', message: '緯度は -90〜90、経度は -180〜180 の範囲で入力してください。' };
    }
    const hasCoords = hasLat && hasLng;

    const rawStart = input.scheduleStartAt?.trim() ?? '';
    let scheduleStartIso: string | null = null;
    if (rawStart) {
      const candidate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawStart) ? `${rawStart}:00+09:00` : rawStart;
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(candidate) ||
        !Number.isFinite(Date.parse(candidate))
      ) {
        return { ok: false, reasonCode: 'INVALID_SCHEDULE', message: '活動日時の形式が正しくありません。' };
      }
      scheduleStartIso = candidate;
    }

    const data = await this.loadReady();
    const id = `sim-act-${String(data.state.graph.activities.length + 1).padStart(3, '0')}`;
    const activity: Activity = {
      id,
      domain: 'simulation',
      revision: 1,
      title: title.startsWith('【模擬】') ? title : `【模擬】${title}`
    };

    const loc: ActivityLocation = {
      id: `loc-${id}-a`,
      activityId: id,
      activityRevision: 1,
      label: input.locationLabel.trim() || '【模擬】場所未指定（座標欠損保持）',
      coordinates: hasCoords
        ? { srid: 4326, latitude: input.latitude as number, longitude: input.longitude as number }
        : null,
      precision: hasCoords ? 'approximate' : 'unknown',
      publicGranularity: hasCoords ? 'municipality' : 'withheld',
      acquisitionBasis: 'Phase 1 模擬活動提案フォーム入力',
      confirmedOn: null,
      sourceId: null
    };

    const cleanSkills = input.requiredSkills.map((s) => s.trim()).filter(Boolean);
    const cleanTransport = input.transportModes.map((m) => m.trim()).filter(Boolean);
    const cleanConfirm = (input.itemsToConfirm ?? []).map((s) => s.trim()).filter(Boolean);

    const cond: ParticipationCondition = {
      id: `cond-${id}`,
      target: { activityId: id, activityRevision: 1 },
      schedule: {
        timeZone: 'Asia/Tokyo',
        dates: scheduleStartIso
          ? { state: 'specified', value: [{ startAt: scheduleStartIso, endAt: null, label: '模擬活動日（提案時入力）' }] }
          : { state: 'not-stated' },
        timeWindowNote: { state: 'unknown', note: '模擬活動提案時に未確定として登録' }
      },
      skills:
        cleanSkills.length > 0
          ? { state: 'specified', value: cleanSkills.map((label) => ({ label, required: true })) }
          : { state: 'not-stated' },
      qualifications: { state: 'unknown', note: '安全要件は人間二次審査で確認' },
      capacity: { state: 'not-stated' },
      fee: { state: 'not-stated' },
      itemsToBring: { state: 'not-stated' },
      transport:
        cleanTransport.length > 0
          ? { state: 'specified', value: { modes: cleanTransport, accessNote: null } }
          : { state: 'not-stated' },
      ageOrOtherConstraints: { state: 'not-stated' },
      itemsToConfirm:
        cleanConfirm.length > 0 ? cleanConfirm : ['活動日程・安全配慮・参加条件を運営者の二次審査で確認する'],
      sourceId: null
    };

    const nextState: GovernedDomainState = structuredClone({
      ...data.state,
      graph: {
        ...data.state.graph,
        activities: [...data.state.graph.activities, activity],
        activityRevisions: [...data.state.graph.activityRevisions, activity],
        locations: [...data.state.graph.locations, loc],
        participationConditions: [...data.state.graph.participationConditions, cond]
      }
    });
    validateGovernedDomainState(nextState);

    await this.store.saveNewSimulationActivityProposal(activity, loc, cond);
    const reloaded = await this.loadReady();
    return { ok: true, activity, snapshot: await this.buildSnapshot(reloaded, activity.id) };
  }

  async createDraftCase(
    personaId: DemoPersonaId,
    input: { activityId: string; candidateActorId: string; role?: string }
  ): Promise<{ ok: true; caseId: string; snapshot: WorkbenchSnapshot } | { ok: false; reasonCode: string; message: string }> {
    const nowIso = this.nowIso();
    const auth = resolveServerAuthContext(personaId, nowIso);
    if (!auth.authenticated || !auth.grants.some((g) => g.role === 'simulation-editor')) {
      return {
        ok: false,
        reasonCode: auth.authenticated ? 'FORBIDDEN_SCOPE_OR_ROLE' : 'UNAUTHENTICATED',
        message: '模擬案件の作成には simulation-editor 権限が必要です。'
      };
    }

    const data = await this.loadReady();
    const activity = data.state.graph.activities.find((a) => a.id === input.activityId);
    if (!activity) {
      return { ok: false, reasonCode: 'UNKNOWN_ACTIVITY', message: '対象の活動が見つかりません。' };
    }
    const candidate = data.state.graph.actors.find((a) => a.id === input.candidateActorId);
    if (!candidate || candidate.domain !== 'simulation') {
      return {
        ok: false,
        reasonCode: 'SIMULATION_ACTORS_ONLY',
        message: '公開カタログ主体ではなく模擬アクターのみ模擬案件に割り当て可能です。'
      };
    }

    const caseId = `sim-case-${String(data.state.graph.cases.length + 1).padStart(3, '0')}`;
    const parties =
      candidate.id === 'sim-org-001'
        ? [{ actorId: candidate.id, role: input.role?.trim() || '模擬協働候補' }]
        : [
            { actorId: 'sim-org-001', role: '模擬主催' },
            { actorId: candidate.id, role: input.role?.trim() || '模擬協働候補' }
          ];

    const draft = createCollaborationDraft(
      data.state.graph,
      caseId,
      { id: activity.id, domain: activity.domain, revision: activity.revision },
      parties
    );

    const governance = {
      caseId,
      createdByAccountId: auth.userAccountId,
      lastMaterialChangeByAccountId: null,
      lastMaterialChangeRevision: 1
    };

    await this.store.saveNewCollaborationCase(draft, governance);
    const reloaded = await this.loadReady();
    return { ok: true, caseId, snapshot: await this.buildSnapshot(reloaded, activity.id) };
  }

  async runAIPrimaryReview(
    caseId: string
  ): Promise<
    | { ok: true; assessment: StructuredPrimaryAssessment; snapshot: WorkbenchSnapshot }
    | { ok: false; reasonCode: string; message: string }
  > {
    const data = await this.loadReady();
    const targetCase = data.state.graph.cases.find((c) => c.id === caseId);
    if (!targetCase) {
      return { ok: false, reasonCode: 'UNKNOWN_CASE', message: '対象の模擬案件が見つかりません。' };
    }

    const allRecs = await this.computePostGISRecommendations(data, targetCase.activity.id);
    const partyIds = new Set(targetCase.parties.map((p) => p.actorId));
    const matchingEvidence = allRecs.filter((r) => partyIds.has(r.actorId));

    const recId = `ai-rec-${data.state.aiRecommendations.length + 1}-${targetCase.id}-r${targetCase.revision}`;
    const assessment = await deterministicPrimaryReviewer.evaluateCase({
      state: data.state,
      caseId: targetCase.id,
      recommendationId: recId,
      generatedAt: this.nowIso(),
      matchingEvidence
    });

    // Validate domain invariant before persisting
    appendAIRecommendation(data.state, assessment);
    await this.store.appendAIPrimaryAssessment(assessment);

    const reloaded = await this.loadReady();
    return { ok: true, assessment, snapshot: await this.buildSnapshot(reloaded, targetCase.activity.id) };
  }

  async submitHumanReview(
    personaId: DemoPersonaId,
    input: {
      caseId: string;
      expectedVersion: number;
      decision: 'approved' | 'rejected';
      reason: string;
      aiRecommendationId?: string | null;
      policyVersion?: string;
    }
  ): Promise<
    | { ok: true; auditEvent: AuditEvent; snapshot: WorkbenchSnapshot }
    | { ok: false; reasonCode: string; message: string; deniedAuditEvent: AuditEvent; snapshot: WorkbenchSnapshot }
  > {
    const data = await this.loadReady();
    const nowIso = this.nowIso();
    const auth = resolveServerAuthContext(personaId, nowIso);
    const opId = this.nextOpId('op-review', data.state);
    const corrId = `corr-${opId}`;

    const cmd = recordHumanReview(
      data.state,
      auth,
      {
        operationId: opId,
        correlationId: corrId,
        caseId: input.caseId,
        expectedVersion: input.expectedVersion,
        decision: input.decision,
        reason: input.reason,
        policyVersion: input.policyVersion?.trim() || 'm3-human-review-v0.1',
        aiRecommendationId: input.aiRecommendationId ?? null
      },
      nowIso
    );

    const targetCase = data.state.graph.cases.find((c) => c.id === input.caseId);
    if (!cmd.ok) {
      await this.store.appendDeniedAudit(cmd.deniedAuditEvent);
      const reloaded = await this.loadReady();
      return {
        ok: false,
        reasonCode: cmd.reasonCode,
        message: cmd.message,
        deniedAuditEvent: cmd.deniedAuditEvent,
        snapshot: await this.buildSnapshot(reloaded, targetCase?.activity.id)
      };
    }

    if (!cmd.idempotentReplay && targetCase) {
      const reviewRecord = cmd.state.reviewRecords[cmd.state.reviewRecords.length - 1];
      await this.store.commitHumanReview({
        operationId: opId,
        caseId: targetCase.id,
        expectedVersion: input.expectedVersion,
        stage: targetCase.stage,
        reviewRecord,
        auditEvent: cmd.auditEvent
      });
    }

    const reloaded = await this.loadReady();
    return { ok: true, auditEvent: cmd.auditEvent, snapshot: await this.buildSnapshot(reloaded, targetCase?.activity.id) };
  }

  async applyMaterialChange(
    personaId: DemoPersonaId,
    input: {
      caseId: string;
      expectedVersion: number;
      changeKind: MaterialChangeKind;
      changeSummary: string;
      addActorId?: string;
    }
  ): Promise<
    | { ok: true; auditEvent: AuditEvent; snapshot: WorkbenchSnapshot }
    | { ok: false; reasonCode: string; message: string; deniedAuditEvent: AuditEvent; snapshot: WorkbenchSnapshot }
  > {
    const data = await this.loadReady();
    const nowIso = this.nowIso();
    const auth = resolveServerAuthContext(personaId, nowIso);
    const opId = this.nextOpId('op-change', data.state);
    const corrId = `corr-${opId}`;
    const existingCase = data.state.graph.cases.find((c) => c.id === input.caseId);

    let nextParties = existingCase?.parties;
    if (existingCase && input.addActorId && !existingCase.parties.some((p) => p.actorId === input.addActorId)) {
      nextParties = [...existingCase.parties, { actorId: input.addActorId, role: '模擬追加候補' }];
    }

    const cmd = applyMaterialCaseChange(
      data.state,
      auth,
      {
        operationId: opId,
        correlationId: corrId,
        caseId: input.caseId,
        expectedVersion: input.expectedVersion,
        changeKind: input.changeKind,
        changeSummary: input.changeSummary,
        nextParties
      },
      nowIso
    );

    if (!cmd.ok) {
      await this.store.appendDeniedAudit(cmd.deniedAuditEvent);
      const reloaded = await this.loadReady();
      return {
        ok: false,
        reasonCode: cmd.reasonCode,
        message: cmd.message,
        deniedAuditEvent: cmd.deniedAuditEvent,
        snapshot: await this.buildSnapshot(reloaded, existingCase?.activity.id)
      };
    }

    if (!cmd.idempotentReplay) {
      const updatedCase = cmd.state.graph.cases.find((c) => c.id === input.caseId)!;
      const updatedGov = cmd.state.caseGovernance.find((g) => g.caseId === input.caseId)!;
      await this.store.commitMaterialChange({
        operationId: opId,
        caseId: updatedCase.id,
        expectedVersion: input.expectedVersion,
        nextRevision: updatedCase.revision,
        stage: updatedCase.stage,
        governance: updatedGov,
        nextParties: updatedCase.parties,
        auditEvent: cmd.auditEvent
      });
    }

    const reloaded = await this.loadReady();
    return { ok: true, auditEvent: cmd.auditEvent, snapshot: await this.buildSnapshot(reloaded, existingCase?.activity.id) };
  }

  async advanceCaseStage(
    personaId: DemoPersonaId,
    input: {
      caseId: string;
      expectedVersion: number;
      targetStage: CollaborationStage;
      simulationNote?: string;
    }
  ): Promise<
    | { ok: true; auditEvent: AuditEvent; snapshot: WorkbenchSnapshot }
    | { ok: false; reasonCode: string; message: string; deniedAuditEvent: AuditEvent; snapshot: WorkbenchSnapshot }
  > {
    const data = await this.loadReady();
    const nowIso = this.nowIso();
    const auth = resolveServerAuthContext(personaId, nowIso);
    const opId = this.nextOpId('op-stage', data.state);
    const corrId = `corr-${opId}`;
    const prevCase = data.state.graph.cases.find((c) => c.id === input.caseId);

    const cmd = transitionSimulationCase(
      data.state,
      auth,
      {
        operationId: opId,
        correlationId: corrId,
        caseId: input.caseId,
        expectedVersion: input.expectedVersion,
        targetStage: input.targetStage
      },
      nowIso
    );

    if (!cmd.ok) {
      await this.store.appendDeniedAudit(cmd.deniedAuditEvent);
      const reloaded = await this.loadReady();
      return {
        ok: false,
        reasonCode: cmd.reasonCode,
        message: cmd.message,
        deniedAuditEvent: cmd.deniedAuditEvent,
        snapshot: await this.buildSnapshot(reloaded, prevCase?.activity.id)
      };
    }

    if (!cmd.idempotentReplay && prevCase && auth.authenticated) {
      const defaultNoteByStage: Record<CollaborationStage, string> = {
        draft: '模擬下書きを作成',
        requested: '模擬依頼を発行（外部への実連絡なし）',
        responded: '模擬応答を記録（候補者の参加意向回答を模擬・外部連絡なし）',
        coordinating: '日程および安全条件の模擬調整を記録（外部連絡なし）',
        agreed: '模擬合意を記録（法的拘束・実在主体の同意なし）',
        preparing: '模擬実施準備チェックリストを確認（Phase 1 完了段階）'
      };
      const note: PersistedCollaborationNote = {
        id: `note-${data.collaborationNotes.length + 1}-${opId}`,
        mode: 'simulation',
        externalContactSent: false,
        caseId: prevCase.id,
        caseRevision: prevCase.revision,
        fromStage: prevCase.stage,
        toStage: input.targetStage,
        actorAccountId: auth.userAccountId,
        note: input.simulationNote?.trim() || defaultNoteByStage[input.targetStage],
        recordedAt: nowIso
      };
      await this.store.commitStageTransition({
        operationId: opId,
        caseId: prevCase.id,
        expectedVersion: input.expectedVersion,
        nextStage: input.targetStage,
        auditEvent: cmd.auditEvent,
        collaborationNote: note
      });
    }

    const reloaded = await this.loadReady();
    return { ok: true, auditEvent: cmd.auditEvent, snapshot: await this.buildSnapshot(reloaded, prevCase?.activity.id) };
  }

  async reset(): Promise<
    | { ok: true; snapshot: WorkbenchSnapshot }
    | { ok: false; reasonCode: string; message: string; snapshot: WorkbenchSnapshot }
  > {
    const snapshot = await this.getSnapshot();
    return {
      ok: false,
      reasonCode: 'POSTGIS_PERSISTENT_MODE',
      message: 'PostgreSQL/PostGIS 永続化モードでは履歴保護のためデータ初期化を行いません。',
      snapshot
    };
  }
}

export function createPgSimulationWorkbench(pool: Pool, options?: { now?: () => string }): PgSimulationWorkbench {
  return new PgSimulationWorkbench(pool, options);
}

const globalForRuntime = globalThis as unknown as {
  __satoyamaPgWorkbench?: PgSimulationWorkbench;
};

/**
 * Returns PostgreSQL/PostGIS-backed workbench when DATABASE_URL is configured,
 * falling back cleanly to the in-memory SimulationWorkbench when unset.
 */
export function getActiveWorkbench(): ActiveWorkbench {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl) {
    if (!globalForRuntime.__satoyamaPgWorkbench) {
      const pool = createPgPoolForWorkbench(dbUrl);
      globalForRuntime.__satoyamaPgWorkbench = new PgSimulationWorkbench(pool);
    }
    return globalForRuntime.__satoyamaPgWorkbench;
  }

  const mem = getWorkbench();
  return {
    getSnapshot: async (activityId) => mem.getSnapshot(activityId),
    createActivityProposal: async (personaId, input) => mem.createActivityProposal(personaId, input),
    createDraftCase: async (personaId, input) => mem.createDraftCase(personaId, input),
    runAIPrimaryReview: (caseId) => mem.runAIPrimaryReview(caseId),
    submitHumanReview: (personaId, input) => mem.submitHumanReview(personaId, input),
    applyMaterialChange: (personaId, input) => mem.applyMaterialChange(personaId, input),
    advanceCaseStage: (personaId, input) => mem.advanceCaseStage(personaId, input),
    reset: async () => ({ ok: true, snapshot: mem.reset() })
  };
}
