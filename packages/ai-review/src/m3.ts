import {
  validateGovernedDomainState,
  type AIRecommendationRecord,
  type CollaborationStage,
  type GovernedDomainState,
  type ReviewRecord
} from '@satoyama/domain';

/**
 * Structural summary of M2 matching evidence consumed by M3 AI primary evaluation.
 * Keeps @satoyama/ai-review dependent solely on @satoyama/domain without coupling to @satoyama/matching.
 */
export interface MatchingEvidenceSummary {
  activityId: string;
  activityRevision: number;
  actorId: string;
  policyVersion: string;
  provisionalScore: number;
  geographic: {
    status: 'within-preferred' | 'within-extended' | 'beyond-extended' | 'missing-location';
    distanceMeters: number | null;
    coarsePrecisionCaveat: boolean;
    missingLocationCount: number;
    transportStatus: 'overlap-found' | 'no-overlap' | 'condition-unspecified' | 'actor-unspecified';
    travelFeasibilityConfirmed: false;
  };
  skill: {
    matchedRequiredSkills: readonly string[];
    missingRequiredSkills: readonly string[];
    matchedOptionalSkills: readonly string[];
    qualificationVerificationRequired: boolean;
    qualificationVerified: false;
  };
  interest: {
    hasRecordedCaseInterest: boolean;
    willingness: 'explicit-interest' | 'open' | 'unknown';
    impliesAgreement: false;
  };
  uncertainties: readonly string[];
  itemsToConfirm: readonly string[];
}

export interface PrimaryAIProviderMetadata {
  provider: string;
  model: string;
  promptVersion: string;
  /** Phase 1 local evaluation never calls external AI APIs or contacts anyone. */
  externalApiCalled: false;
}

export interface StructuredAIReviewInput {
  state: GovernedDomainState;
  caseId: string;
  recommendationId: string;
  generatedAt: string;
  matchingEvidence?: readonly MatchingEvidenceSummary[];
  providerMeta?: Partial<Pick<PrimaryAIProviderMetadata, 'provider' | 'model' | 'promptVersion'>>;
}

export type AITriageSignal =
  | 'recommended-for-human-review'
  | 'caution-human-review'
  | 'insufficient-evidence-for-review';

/**
 * M3 structured AI primary assessment.
 * Always bound to a single simulation case revision and never approves or transitions a case.
 */
export interface StructuredPrimaryAssessment {
  mode: 'simulation-ai-primary';
  status: 'requires-human-review';
  canApprove: false;
  canTransition: false;
  qualificationVerified: false;
  impliesAgreement: false;
  triageSignal: AITriageSignal;
  caseId: string;
  caseRevision: number;
  activityId: string;
  activityRevision: number;
  record: AIRecommendationRecord;
  strengths: readonly string[];
  risksAndGaps: readonly string[];
  requiredHumanChecks: readonly string[];
  uncertainties: readonly string[];
  provenance: PrimaryAIProviderMetadata & { generatedAt: string };
  disclaimers: readonly string[];
}

export interface PrimaryAIReviewProvider {
  evaluateCase(input: StructuredAIReviewInput): Promise<StructuredPrimaryAssessment>;
}

export interface CaseReviewReadiness {
  caseId: string;
  caseRevision: number;
  stage: CollaborationStage;
  currentRevisionAIRecommendations: readonly AIRecommendationRecord[];
  staleAIRecommendationCount: number;
  currentRevisionReviews: readonly ReviewRecord[];
  staleReviewCount: number;
  latestCurrentReview: ReviewRecord | null;
  humanDecisionStatus: 'approved' | 'rejected' | 'pending';
  nextSequentialStage: CollaborationStage | null;
  canAdvanceStage: boolean;
  blockingReasons: readonly string[];
}

const NEXT_STAGE: Partial<Record<CollaborationStage, CollaborationStage>> = {
  draft: 'requested',
  requested: 'coordinating',
  coordinating: 'agreed',
  agreed: 'preparing'
};

export const DEFAULT_M3_PROVIDER_META: Readonly<PrimaryAIProviderMetadata> = Object.freeze({
  provider: 'deterministic-local-reviewer',
  model: 'satoyama-rule-eval-v0.1',
  promptVersion: 'm3-v0.1',
  externalApiCalled: false
});

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

/**
 * Deterministic Phase 1 AI primary evaluator.
 * Produces structured rationale, constraints, and human-check checklists without calling external AI SDKs.
 */
export const deterministicPrimaryReviewer: PrimaryAIReviewProvider = {
  async evaluateCase(input: StructuredAIReviewInput): Promise<StructuredPrimaryAssessment> {
    validateGovernedDomainState(input.state);
    check(text(input.caseId), 'caseId is required');
    check(text(input.recommendationId), 'recommendationId is required');
    validateIsoTimestamp(input.generatedAt, 'generatedAt');

    const targetCase = input.state.graph.cases.find((c) => c.id === input.caseId);
    check(targetCase, `Unknown collaboration case: ${input.caseId}`);
    check(targetCase.mode === 'simulation', 'AI primary review is restricted to simulation cases');

    const actorsById = new Map(input.state.graph.actors.map((a) => [a.id, a]));
    for (const party of targetCase.parties) {
      const actor = actorsById.get(party.actorId);
      check(actor && actor.domain === 'simulation', 'Simulation case parties must belong to simulation domain');
    }

    const actRev = input.state.graph.activityRevisions.find(
      (r) => r.id === targetCase.activity.id && r.revision === targetCase.activity.revision
    );
    check(actRev, 'Activity revision referenced by case not found');

    const locations = input.state.graph.locations.filter(
      (l) => l.activityId === actRev.id && l.activityRevision === actRev.revision
    );
    const condition = input.state.graph.participationConditions.find(
      (c) => c.target.activityId === actRev.id && c.target.activityRevision === actRev.revision
    );

    const evidenceList = input.matchingEvidence ?? [];
    for (const ev of evidenceList) {
      check(
        ev.activityId === actRev.id && ev.activityRevision === actRev.revision,
        'Matching evidence activity revision mismatch'
      );
      const evActor = actorsById.get(ev.actorId);
      check(evActor && evActor.domain === 'simulation', 'Matching evidence must reference simulation actors only');
    }

    const strengths: string[] = [];
    const risksAndGaps: string[] = [];
    const requiredHumanChecks: string[] = [];
    const uncertainties: string[] = [];

    if (targetCase.parties.length > 0) {
      strengths.push(
        `模擬案件（rev ${targetCase.revision}）に ${targetCase.parties.length} 件の模擬当事者が設定済み。`
      );
    }

    if (actRev.domain === 'public-catalog') {
      requiredHumanChecks.push('公開活動カタログの出典・参照日・募集状況が最新であることを確認する。');
    } else {
      strengths.push('対象活動は模擬ドメイン（simulation）に分離されており、実在団体への誤連絡リスクはない。');
    }

    // Evaluate location completeness and precision
    const missingLocations = locations.filter((l) => l.coordinates === null || l.precision === 'unknown');
    const coarseLocations = locations.filter(
      (l) => l.precision === 'approximate' || l.precision === 'administrative-area'
    );
    if (locations.length === 0) {
      risksAndGaps.push('活動場所が未登録のため、地理的適合性を検証できていない。');
      uncertainties.push('活動場所（ActivityLocation）が未登録。');
    } else {
      if (missingLocations.length > 0) {
        risksAndGaps.push(`位置座標が欠損（null）の拠点が ${missingLocations.length} 件ある。`);
        uncertainties.push('座標欠損拠点の現地位置・集合場所が未確認。');
      }
      if (coarseLocations.length > 0) {
        uncertainties.push('概算または行政区域精度の位置情報を含むため距離は目安値。');
      }
    }

    // Evaluate participation condition completeness
    if (!condition) {
      risksAndGaps.push('参加条件（ParticipationCondition）が未登録。');
      uncertainties.push('日程・参加費・移動条件・持ち物などの条件が未定義。');
      requiredHumanChecks.push('活動の日程・移動手段・参加条件を運営者が手動確認する。');
    } else {
      if (condition.schedule.dates.state === 'specified') {
        strengths.push(`日程スロット（${condition.schedule.dates.value.length} 件, ${condition.schedule.timeZone}）が明示されている。`);
      } else {
        uncertainties.push(`日程が ${condition.schedule.dates.state} のため開催日時が未確定。`);
      }
      if (condition.qualifications.state === 'specified') {
        if (condition.qualifications.value.some((q) => q.verificationRequired)) {
          risksAndGaps.push('確認必須の資格要件が含まれており、AI・技能申告だけでは資格確認済みとみなせない。');
          requiredHumanChecks.push('必要な資格・安全講習の保有状況を人間審査で確認する。');
        }
      } else {
        uncertainties.push(`資格要件が ${condition.qualifications.state}。`);
      }
      for (const item of condition.itemsToConfirm) {
        requiredHumanChecks.push(`要確認事項: ${item}`);
      }
    }

    // Evaluate M2 matching evidence if supplied
    let hasHighRisk = risksAndGaps.length > 0;
    let avgScore: number | null = null;
    if (evidenceList.length > 0) {
      avgScore = Math.round(
        evidenceList.reduce((acc, item) => acc + item.provisionalScore, 0) / evidenceList.length
      );
      strengths.push(
        `M2 暫定マッチング根拠（${evidenceList.length} 件, 平均暫定スコア ${avgScore}/100, policy ${evidenceList[0].policyVersion}）を参照済み。`
      );
      for (const ev of evidenceList) {
        if (ev.skill.matchedRequiredSkills.length > 0) {
          strengths.push(`必須技能の申告一致あり（${ev.actorId}: ${ev.skill.matchedRequiredSkills.join('、')}）。`);
        }
        if (ev.skill.missingRequiredSkills.length > 0) {
          hasHighRisk = true;
          risksAndGaps.push(`必須技能の申告不足あり（${ev.actorId}: ${ev.skill.missingRequiredSkills.join('、')}）。`);
        }
        if (ev.geographic.status === 'beyond-extended' || ev.geographic.transportStatus === 'no-overlap') {
          hasHighRisk = true;
          risksAndGaps.push(`地理・移動条件に懸念あり（${ev.actorId}: ${ev.geographic.status} / ${ev.geographic.transportStatus}）。`);
        }
        for (const u of ev.uncertainties) {
          if (!uncertainties.includes(u)) uncertainties.push(u);
        }
        for (const item of ev.itemsToConfirm) {
          const formatted = `要確認事項: ${item}`;
          if (!requiredHumanChecks.includes(formatted)) requiredHumanChecks.push(formatted);
        }
      }
    } else {
      uncertainties.push('M2 マッチング根拠が未添付のため、地理・技能・意欲スコアの自動照合が不足している。');
    }

    requiredHumanChecks.push(
      '作成者・重要変更者・案件当事者以外の第三者レビュアー（reviewer 権限）が理由付きで承認／却下を判断する。',
      'Phase 1 模擬環境であることを確認し、実在団体・個人への外部連絡を行わない。'
    );

    let triageSignal: AITriageSignal;
    if (locations.length === 0 && !condition && evidenceList.length === 0) {
      triageSignal = 'insufficient-evidence-for-review';
    } else if (hasHighRisk || (avgScore !== null && avgScore < 65)) {
      triageSignal = 'caution-human-review';
    } else {
      triageSignal = 'recommended-for-human-review';
    }

    const provider = input.providerMeta?.provider?.trim() || DEFAULT_M3_PROVIDER_META.provider;
    const model = input.providerMeta?.model?.trim() || DEFAULT_M3_PROVIDER_META.model;
    const promptVersion = input.providerMeta?.promptVersion?.trim() || DEFAULT_M3_PROVIDER_META.promptVersion;

    const rationale = [
      `[AI一次評価 / ${triageSignal}] 案件 ${targetCase.id} (rev ${targetCase.revision}) を対象活動「${actRev.title}」(rev ${actRev.revision}) に対して評価しました。`,
      strengths.length > 0 ? `根拠: ${strengths.join(' ')}` : '根拠: 評価可能な補足情報なし。',
      risksAndGaps.length > 0 ? `懸念・不足: ${risksAndGaps.join(' ')}` : '懸念・不足: 重大な欠落は未検出（人間確認は必須）。'
    ].join(' ');

    const constraints = [
      'AI一次評価は承認・合意・資格確認を意味しない（人間の二次審査が必須）。',
      'Phase 1 模擬処理のみであり、外部API呼出および実在団体への連絡は行わない。',
      ...uncertainties
    ];

    const record: AIRecommendationRecord = {
      id: input.recommendationId.trim(),
      caseId: targetCase.id,
      caseRevision: targetCase.revision,
      model,
      promptVersion,
      rationale,
      constraints,
      generatedAt: input.generatedAt,
      status: 'requires-human-review'
    };

    return {
      mode: 'simulation-ai-primary',
      status: 'requires-human-review',
      canApprove: false,
      canTransition: false,
      qualificationVerified: false,
      impliesAgreement: false,
      triageSignal,
      caseId: targetCase.id,
      caseRevision: targetCase.revision,
      activityId: actRev.id,
      activityRevision: actRev.revision,
      record,
      strengths,
      risksAndGaps,
      requiredHumanChecks,
      uncertainties,
      provenance: {
        provider,
        model,
        promptVersion,
        generatedAt: input.generatedAt,
        externalApiCalled: false
      },
      disclaimers: [
        'AI一次推奨の結果だけで模擬依頼・調整・合意へ進めることはできません。',
        '案件に重要変更が入った場合（revision 更新）、過去の承認は失効し再審査が必要です。'
      ]
    };
  }
};

/**
 * Pure append-only helper that records an AIRecommendationRecord into GovernedDomainState.
 * Never mutates existing recommendations, review records, or case stages.
 */
export function appendAIRecommendation(
  state: GovernedDomainState,
  assessment: StructuredPrimaryAssessment
): GovernedDomainState {
  validateGovernedDomainState(state);
  check(assessment.status === 'requires-human-review', 'AI assessment must require human review');
  check(assessment.record.status === 'requires-human-review', 'AIRecommendationRecord status must require human review');

  const targetCase = state.graph.cases.find((c) => c.id === assessment.record.caseId);
  check(targetCase, 'Unknown case for AIRecommendationRecord');
  check(
    targetCase.revision === assessment.record.caseRevision,
    'AIRecommendationRecord caseRevision must match current case revision'
  );
  check(
    !state.aiRecommendations.some((r) => r.id === assessment.record.id),
    `Duplicate AIRecommendationRecord ID: ${assessment.record.id}`
  );

  const nextState: GovernedDomainState = structuredClone({
    ...state,
    aiRecommendations: [...state.aiRecommendations, assessment.record]
  });
  validateGovernedDomainState(nextState);
  return nextState;
}

/**
 * Computes review & stage-transition readiness for a simulation case bound to its CURRENT revision.
 */
export function getCaseReviewReadiness(state: GovernedDomainState, caseId: string): CaseReviewReadiness {
  validateGovernedDomainState(state);
  const targetCase = state.graph.cases.find((c) => c.id === caseId);
  check(targetCase, `Unknown case: ${caseId}`);

  const allCaseAI = state.aiRecommendations.filter((r) => r.caseId === caseId);
  const currentAI = allCaseAI.filter((r) => r.caseRevision === targetCase.revision);
  const staleAI = allCaseAI.length - currentAI.length;

  const allCaseReviews = state.reviewRecords.filter((r) => r.caseId === caseId);
  const currentReviews = allCaseReviews.filter((r) => r.caseRevision === targetCase.revision);
  const staleReviews = allCaseReviews.length - currentReviews.length;

  const latestCurrentReview = currentReviews.length > 0 ? currentReviews[currentReviews.length - 1] : null;
  const humanDecisionStatus: CaseReviewReadiness['humanDecisionStatus'] =
    latestCurrentReview?.decision === 'approved'
      ? 'approved'
      : latestCurrentReview?.decision === 'rejected'
        ? 'rejected'
        : 'pending';

  const nextSequentialStage = NEXT_STAGE[targetCase.stage] ?? null;
  const blockingReasons: string[] = [];

  if (currentAI.length === 0) {
    blockingReasons.push(`現行リビジョン（rev ${targetCase.revision}）のAI一次推奨が未実行です。`);
  }
  if (humanDecisionStatus === 'pending') {
    blockingReasons.push(
      staleReviews > 0
        ? `案件が rev ${targetCase.revision} に更新されたため、現行リビジョンでの人間二次審査（再審査）が必要です。`
        : `現行リビジョン（rev ${targetCase.revision}）に対する人間二次審査（承認）が必要です。`
    );
  } else if (humanDecisionStatus === 'rejected') {
    blockingReasons.push(`現行リビジョン（rev ${targetCase.revision}）は人間二次審査で却下されています。`);
  }
  if (!nextSequentialStage) {
    blockingReasons.push('模擬協働フローは最終段階（preparing）に到達しています。');
  }

  return {
    caseId: targetCase.id,
    caseRevision: targetCase.revision,
    stage: targetCase.stage,
    currentRevisionAIRecommendations: currentAI,
    staleAIRecommendationCount: staleAI,
    currentRevisionReviews: currentReviews,
    staleReviewCount: staleReviews,
    latestCurrentReview,
    humanDecisionStatus,
    nextSequentialStage,
    canAdvanceStage: humanDecisionStatus === 'approved' && nextSequentialStage !== null,
    blockingReasons
  };
}
