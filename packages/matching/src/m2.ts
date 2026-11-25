import {
  validateLocationConditionsGraph,
  type ActivityLocation,
  type Actor,
  type GeoPoint4326,
  type LocationConditionsGraph,
  type LocationPrecision,
  type ParticipationCondition,
  type SpatialDistanceQueryResult
} from '@satoyama/domain';

/**
 * Provisional matching thresholds. Business thresholds remain unfinalized (Q04 / requirements.md);
 * callers supply explicit config rather than relying on hardcoded policy.
 */
export interface MatchingPolicyConfig {
  policyVersion: string;
  preferredDistanceMeters: number;
  extendedDistanceMeters: number;
  weights: {
    geographic: number;
    skill: number;
    interest: number;
  };
}

export const DEFAULT_PROVISIONAL_MATCHING_POLICY: Readonly<MatchingPolicyConfig> = Object.freeze({
  policyVersion: 'm2-provisional-v0.1',
  preferredDistanceMeters: 15_000,
  extendedDistanceMeters: 50_000,
  weights: Object.freeze({
    geographic: 0.35,
    skill: 0.4,
    interest: 0.25
  })
});

/** Optional simulation-actor mobility & willingness context for M2 matching. */
export interface ActorMatchingProfile {
  actorId: string;
  baseCoordinates: GeoPoint4326 | null;
  availableTransportModes: readonly string[];
  willingness: 'explicit-interest' | 'open' | 'unknown';
  note?: string | null;
}

export interface GeographicEvaluation {
  status: 'within-preferred' | 'within-extended' | 'beyond-extended' | 'missing-location';
  distanceMeters: number | null;
  nearestLocationId: string | null;
  nearestLocationPrecision: LocationPrecision | null;
  coarsePrecisionCaveat: boolean;
  missingLocationCount: number;
  transportOverlap: readonly string[];
  transportStatus: 'overlap-found' | 'no-overlap' | 'condition-unspecified' | 'actor-unspecified';
  /** Distance and transport overlap never establish actual participation feasibility alone. */
  travelFeasibilityConfirmed: false;
  score: number;
  reasons: readonly string[];
}

export interface SkillEvaluation {
  matchedRequiredSkills: readonly string[];
  missingRequiredSkills: readonly string[];
  matchedOptionalSkills: readonly string[];
  conditionState: ParticipationCondition['skills']['state'] | 'no-condition-record';
  qualificationVerificationRequired: boolean;
  /** Expert attributes and skill declarations never certify verified credentials. */
  qualificationVerified: false;
  score: number;
  reasons: readonly string[];
}

export interface InterestEvaluation {
  hasRecordedCaseInterest: boolean;
  willingness: ActorMatchingProfile['willingness'];
  /** Interest never implies invitation, approval, or agreement. */
  impliesAgreement: false;
  score: number;
  reasons: readonly string[];
}

export interface MatchRecommendation {
  mode: 'simulation-recommendation';
  status: 'requires-ai-and-human-review';
  /** Matching never concludes participation eligibility or verified credentials. */
  canParticipate: null;
  qualificationVerified: false;
  impliesAgreement: false;
  activityId: string;
  activityRevision: number;
  actorId: string;
  actorDisplayName: string;
  actorKind: Actor['kind'];
  policyVersion: string;
  /** Provisional ranking signal (0-100) for human/AI review triage only. */
  provisionalScore: number;
  geographic: GeographicEvaluation;
  skill: SkillEvaluation;
  interest: InterestEvaluation;
  uncertainties: readonly string[];
  itemsToConfirm: readonly string[];
  disclaimers: readonly string[];
}

export interface RecommendCandidatesInput {
  graph: LocationConditionsGraph;
  activityId: string;
  activityRevision: number;
  /** Optional explicit subset of simulation actor IDs; public-catalog actors are strictly rejected. */
  candidateActorIds?: readonly string[];
  actorProfiles?: readonly ActorMatchingProfile[];
  /** Optional PostGIS-computed distances keyed by actorId (from PgM1Repository.queryLocationsByDistance). */
  precomputedDistancesByActor?: Readonly<Record<string, readonly SpatialDistanceQueryResult[]>>;
  policy?: MatchingPolicyConfig;
}

const EARTH_RADIUS_METERS = 6_371_008.8;

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

/** Pure WGS-84 great-circle distance in meters (used when PostGIS precomputed distance is not supplied). */
export function computeDistanceMeters4326(a: GeoPoint4326, b: GeoPoint4326): number {
  check(a.srid === 4326 && b.srid === 4326, 'SRID 4326 required');
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function validatePolicy(policy: MatchingPolicyConfig) {
  check(
    Number.isFinite(policy.preferredDistanceMeters) &&
      policy.preferredDistanceMeters > 0 &&
      Number.isFinite(policy.extendedDistanceMeters) &&
      policy.extendedDistanceMeters >= policy.preferredDistanceMeters,
    'Invalid matching distance thresholds'
  );
  const { geographic, skill, interest } = policy.weights;
  check(
    [geographic, skill, interest].every((w) => Number.isFinite(w) && w >= 0) &&
      geographic + skill + interest > 0,
    'Invalid matching weights'
  );
}

function normalizeLabel(s: string): string {
  return s.trim().toLowerCase();
}

export function evaluateGeographicSuitability(params: {
  locations: readonly ActivityLocation[];
  condition: ParticipationCondition | undefined;
  actorProfile: ActorMatchingProfile | undefined;
  precomputedDistances?: readonly SpatialDistanceQueryResult[];
  policy: MatchingPolicyConfig;
}): GeographicEvaluation {
  const { locations, condition, actorProfile, precomputedDistances, policy } = params;
  const reasons: string[] = [];

  // Build candidate distance readings from PostGIS precomputed results or pure SRID-4326 calculation
  let bestDistance: number | null = null;
  let bestLocationId: string | null = null;
  let bestPrecision: LocationPrecision | null = null;
  let missingCount = 0;

  if (precomputedDistances && precomputedDistances.length > 0) {
    for (const d of precomputedDistances) {
      if (d.distanceMeters === null || d.precision === 'unknown') {
        missingCount++;
        continue;
      }
      if (bestDistance === null || d.distanceMeters < bestDistance) {
        bestDistance = d.distanceMeters;
        bestLocationId = d.locationId;
        bestPrecision = d.precision;
      }
    }
  } else {
    for (const loc of locations) {
      if (loc.coordinates === null || loc.precision === 'unknown') {
        missingCount++;
        continue;
      }
      if (actorProfile?.baseCoordinates) {
        const meters = computeDistanceMeters4326(actorProfile.baseCoordinates, loc.coordinates);
        if (bestDistance === null || meters < bestDistance) {
          bestDistance = meters;
          bestLocationId = loc.id;
          bestPrecision = loc.precision;
        }
      }
    }
    if (locations.length === 0 || !actorProfile?.baseCoordinates) {
      if (locations.length === 0) reasons.push('活動の位置情報が未登録のため距離を算出できない。');
      if (!actorProfile?.baseCoordinates) reasons.push('候補者の拠点座標が未登録のため距離を算出できない。');
    }
  }

  let status: GeographicEvaluation['status'];
  let geoScore: number;
  const coarsePrecisionCaveat = bestPrecision === 'approximate' || bestPrecision === 'administrative-area';

  if (bestDistance === null) {
    status = 'missing-location';
    geoScore = 30; // Neutral-low provisional score without fabricating 0m proximity
    reasons.push('位置欠損のため距離未評価（原点補完や近接断定は行わない）。');
  } else if (bestDistance <= policy.preferredDistanceMeters) {
    status = 'within-preferred';
    geoScore = coarsePrecisionCaveat ? 80 : 95;
    reasons.push(`暫定基準距離（${policy.preferredDistanceMeters}m）以内（実測 ${Math.round(bestDistance)}m）。`);
  } else if (bestDistance <= policy.extendedDistanceMeters) {
    status = 'within-extended';
    geoScore = coarsePrecisionCaveat ? 55 : 65;
    reasons.push(`暫定広域基準（${policy.extendedDistanceMeters}m）以内（実測 ${Math.round(bestDistance)}m）。`);
  } else {
    status = 'beyond-extended';
    geoScore = 20;
    reasons.push(`暫定広域基準を超過（実測 ${Math.round(bestDistance)}m）。移動負担の人間確認が必要。`);
  }

  if (coarsePrecisionCaveat) {
    reasons.push(`位置精度が ${bestPrecision} のため距離は概算値であり、実移動可能性は別途確認が必要。`);
  }

  // Transport comparison
  const actorModes = (actorProfile?.availableTransportModes ?? []).map(normalizeLabel);
  let transportOverlap: string[] = [];
  let transportStatus: GeographicEvaluation['transportStatus'];

  if (!condition || condition.transport.state !== 'specified') {
    transportStatus = 'condition-unspecified';
    reasons.push(`活動側の移動条件が ${condition ? condition.transport.state : '未登録'} のため移動適合は未確定。`);
  } else if (actorModes.length === 0) {
    transportStatus = 'actor-unspecified';
    reasons.push('候補者の利用可能移動手段が未申告のため移動適合は未確定。');
  } else {
    const condModes = condition.transport.value.modes.map(normalizeLabel);
    transportOverlap = condition.transport.value.modes.filter((m) => actorModes.includes(normalizeLabel(m)));
    if (transportOverlap.length > 0) {
      transportStatus = 'overlap-found';
      reasons.push(`移動手段の一致候補あり: ${transportOverlap.join(', ')}（実際の時刻表・アクセスは要確認）。`);
    } else {
      transportStatus = 'no-overlap';
      geoScore = Math.max(10, geoScore - 25);
      reasons.push(`移動手段の不一致（活動側: ${condModes.join(', ')} / 候補側: ${actorModes.join(', ')}）。`);
    }
  }

  return {
    status,
    distanceMeters: bestDistance === null ? null : Math.round(bestDistance),
    nearestLocationId: bestLocationId,
    nearestLocationPrecision: bestPrecision,
    coarsePrecisionCaveat,
    missingLocationCount: missingCount,
    transportOverlap,
    transportStatus,
    travelFeasibilityConfirmed: false,
    score: geoScore,
    reasons
  };
}

export function evaluateSkillAlignment(params: {
  actor: Actor;
  graph: LocationConditionsGraph;
  activityId: string;
  activityRevision: number;
  condition: ParticipationCondition | undefined;
}): SkillEvaluation {
  const { actor, graph, activityId, activityRevision, condition } = params;
  const reasons: string[] = [];

  const actorLabels = new Set<string>([
    ...actor.expertise.map((e) => normalizeLabel(e.label)),
    ...graph.actorSkills.filter((s) => s.actorId === actor.id).map((s) => normalizeLabel(s.label))
  ]);

  const skillReqs = new Map<string, { label: string; required: boolean }>();
  if (condition && condition.skills.state === 'specified') {
    for (const s of condition.skills.value) {
      skillReqs.set(normalizeLabel(s.label), { label: s.label, required: s.required });
    }
  }
  for (const r of graph.resourceRequirements) {
    if (r.owner.kind === 'activity' && r.owner.id === activityId && r.owner.revision === activityRevision && r.category === 'skill') {
      const key = normalizeLabel(r.title);
      if (!skillReqs.has(key)) skillReqs.set(key, { label: r.title, required: r.required });
    }
  }

  const matchedRequired: string[] = [];
  const missingRequired: string[] = [];
  const matchedOptional: string[] = [];

  for (const [key, req] of skillReqs.entries()) {
    if (actorLabels.has(key)) {
      if (req.required) matchedRequired.push(req.label);
      else matchedOptional.push(req.label);
    } else if (req.required) {
      missingRequired.push(req.label);
    }
  }

  const conditionState = condition ? condition.skills.state : 'no-condition-record';
  const qualificationVerificationRequired =
    !condition ||
    condition.qualifications.state === 'unknown' ||
    condition.qualifications.state === 'not-stated' ||
    (condition.qualifications.state === 'specified' && condition.qualifications.value.some((q) => q.verificationRequired));

  let score: number;
  if (skillReqs.size === 0) {
    score = conditionState === 'no-restriction' ? 80 : 50;
    reasons.push(
      conditionState === 'no-restriction'
        ? '技能制約なしの記載あり。'
        : `技能条件が ${conditionState} のため技能適合は中立評価。`
    );
  } else {
    const reqTotal = matchedRequired.length + missingRequired.length;
    const reqRatio = reqTotal === 0 ? 1 : matchedRequired.length / reqTotal;
    const optBonus = Math.min(20, matchedOptional.length * 10);
    score = Math.round(reqRatio * 80 + optBonus);
    if (matchedRequired.length > 0) reasons.push(`必須技能の申告一致: ${matchedRequired.join(', ')}（未確認申告）。`);
    if (missingRequired.length > 0) reasons.push(`必須技能の申告不足: ${missingRequired.join(', ')}。`);
    if (matchedOptional.length > 0) reasons.push(`任意技能の申告一致: ${matchedOptional.join(', ')}。`);
  }

  if (qualificationVerificationRequired) {
    reasons.push('資格要件は未確認または確認必須のため、専門家属性・技能申告だけで資格確認済みとしない。');
  }

  return {
    matchedRequiredSkills: matchedRequired,
    missingRequiredSkills: missingRequired,
    matchedOptionalSkills: matchedOptional,
    conditionState,
    qualificationVerificationRequired,
    qualificationVerified: false,
    score: Math.min(100, Math.max(0, score)),
    reasons
  };
}

export function evaluateInterestSignal(params: {
  actorId: string;
  graph: LocationConditionsGraph;
  activityId: string;
  activityRevision: number;
  actorProfile: ActorMatchingProfile | undefined;
}): InterestEvaluation {
  const { actorId, graph, activityId, activityRevision, actorProfile } = params;
  const reasons: string[] = [];

  const relatedCaseIds = new Set(
    graph.cases
      .filter((c) => c.activity.id === activityId && c.activity.revision === activityRevision)
      .map((c) => c.id)
  );
  const hasRecordedCaseInterest = graph.interests.some(
    (i) => i.actorId === actorId && relatedCaseIds.has(i.caseId)
  );
  const willingness: ActorMatchingProfile['willingness'] = hasRecordedCaseInterest
    ? 'explicit-interest'
    : actorProfile?.willingness ?? 'unknown';

  let score: number;
  if (hasRecordedCaseInterest) {
    score = 95;
    reasons.push('対象活動に関連する模擬案件への参加意向レコードあり（招待・合意ではない）。');
  } else if (willingness === 'explicit-interest') {
    score = 85;
    reasons.push('候補者プロフィール上の明示的参加意欲あり（招待・合意ではない）。');
  } else if (willingness === 'open') {
    score = 60;
    reasons.push('候補者は参加検討可（open）と申告。');
  } else {
    score = 35;
    reasons.push('参加意欲が未確認（unknown）。');
  }

  return {
    hasRecordedCaseInterest,
    willingness,
    impliesAgreement: false,
    score,
    reasons
  };
}

/**
 * Produces ranked provisional simulation recommendations for an Activity revision.
 * Strictly excludes public-catalog actors and never decides participation eligibility or agreement.
 */
export function recommendSimulationCandidates(input: RecommendCandidatesInput): readonly MatchRecommendation[] {
  validateLocationConditionsGraph(input.graph);
  const policy = input.policy ?? DEFAULT_PROVISIONAL_MATCHING_POLICY;
  validatePolicy(policy);

  const actRev = input.graph.activityRevisions.find(
    (r) => r.id === input.activityId && r.revision === input.activityRevision
  );
  check(actRev, 'Unknown activity revision');

  const actorsById = new Map(input.graph.actors.map((a) => [a.id, a]));
  let candidates: Actor[];
  if (input.candidateActorIds) {
    candidates = input.candidateActorIds.map((id) => {
      const actor = actorsById.get(id);
      check(actor, `Unknown candidate actor: ${id}`);
      check(actor.domain === 'simulation', 'Public catalog actors cannot be recommended as simulation participants');
      return actor;
    });
  } else {
    candidates = input.graph.actors.filter((a) => a.domain === 'simulation');
  }

  const locations = input.graph.locations.filter(
    (l) => l.activityId === input.activityId && l.activityRevision === input.activityRevision
  );
  const condition = input.graph.participationConditions.find(
    (c) => c.target.activityId === input.activityId && c.target.activityRevision === input.activityRevision
  );
  const profilesById = new Map((input.actorProfiles ?? []).map((p) => [p.actorId, p]));
  const weightSum = policy.weights.geographic + policy.weights.skill + policy.weights.interest;

  const recs: MatchRecommendation[] = candidates.map((actor) => {
    const actorProfile = profilesById.get(actor.id);
    const geographic = evaluateGeographicSuitability({
      locations,
      condition,
      actorProfile,
      precomputedDistances: input.precomputedDistancesByActor?.[actor.id],
      policy
    });
    const skill = evaluateSkillAlignment({
      actor,
      graph: input.graph,
      activityId: input.activityId,
      activityRevision: input.activityRevision,
      condition
    });
    const interest = evaluateInterestSignal({
      actorId: actor.id,
      graph: input.graph,
      activityId: input.activityId,
      activityRevision: input.activityRevision,
      actorProfile
    });

    const provisionalScore = Math.round(
      (geographic.score * policy.weights.geographic +
        skill.score * policy.weights.skill +
        interest.score * policy.weights.interest) /
        weightSum
    );

    const uncertainties: string[] = [];
    if (geographic.status === 'missing-location' || geographic.missingLocationCount > 0) {
      uncertainties.push('位置情報が欠損している拠点を含む。');
    }
    if (geographic.coarsePrecisionCaveat) {
      uncertainties.push(`位置精度が ${geographic.nearestLocationPrecision} の概算である。`);
    }
    if (geographic.transportStatus !== 'overlap-found') {
      uncertainties.push(`移動手段の適合が未確認または不一致（${geographic.transportStatus}）。`);
    }
    if (skill.qualificationVerificationRequired) {
      uncertainties.push('資格要件の真偽は未確認（M2では資格確認を行わない）。');
    }
    if (condition) {
      if (condition.schedule.dates.state !== 'specified') {
        uncertainties.push(`日程条件が ${condition.schedule.dates.state} である。`);
      }
      if (condition.ageOrOtherConstraints.state === 'unknown' || condition.ageOrOtherConstraints.state === 'not-stated') {
        uncertainties.push(`年齢・その他制約が ${condition.ageOrOtherConstraints.state} である。`);
      }
    } else {
      uncertainties.push('参加条件レコードが未登録である。');
    }

    return {
      mode: 'simulation-recommendation',
      status: 'requires-ai-and-human-review',
      canParticipate: null,
      qualificationVerified: false,
      impliesAgreement: false,
      activityId: actRev.id,
      activityRevision: actRev.revision,
      actorId: actor.id,
      actorDisplayName: actor.displayName,
      actorKind: actor.kind,
      policyVersion: policy.policyVersion,
      provisionalScore,
      geographic,
      skill,
      interest,
      uncertainties,
      itemsToConfirm: condition ? [...condition.itemsToConfirm] : [],
      disclaimers: [
        '本推薦は暫定スコアに基づく候補提示であり、距離や技能申告だけで参加可能・資格確認済みと断定しない。',
        'AI一次評価および人間二次審査を経ずに模擬依頼・合意へ進めない。'
      ]
    };
  });

  return recs.sort((a, b) => b.provisionalScore - a.provisionalScore || a.actorId.localeCompare(b.actorId));
}
