import { validateActorProvenanceGraph, type ActorProvenanceGraph } from './actor-provenance';

/** WGS 84 (SRID 4326) point coordinates. Never fabricate (0, 0) for missing locations; use null. */
export interface GeoPoint4326 {
  srid: 4326;
  latitude: number;
  longitude: number;
}

export type LocationPrecision = 'venue' | 'approximate' | 'administrative-area' | 'unknown';
export type PublicGranularity = 'venue' | 'district' | 'municipality' | 'prefecture' | 'withheld';

/** Multiple sites per activity revision are represented as separate ActivityLocation entries. */
export interface ActivityLocation {
  id: string;
  activityId: string;
  activityRevision: number;
  label: string;
  /** Must be null when location is unknown/missing; never fill with origin or guessed coordinates. */
  coordinates: GeoPoint4326 | null;
  precision: LocationPrecision;
  publicGranularity: PublicGranularity;
  acquisitionBasis: string;
  confirmedOn: string | null;
  /** Required for public-catalog activities and must reference an existing SourceDocument. */
  sourceId: string | null;
}

/** Explicitly distinguishes not-stated, unknown, no-restriction, and specified condition values. */
export type ConditionFieldState<T> =
  | { state: 'not-stated' }
  | { state: 'unknown'; note?: string | null }
  | { state: 'no-restriction'; note?: string | null }
  | { state: 'specified'; value: T };

export interface ScheduleSlot {
  startAt: string;
  endAt: string | null;
  label: string | null;
}

export interface ScheduleCondition {
  /** IANA timezone identifier (e.g. 'Asia/Tokyo'). */
  timeZone: string;
  dates: ConditionFieldState<readonly ScheduleSlot[]>;
  timeWindowNote: ConditionFieldState<string>;
}

export interface SkillRequirement {
  label: string;
  required: boolean;
}

export interface QualificationRequirement {
  name: string;
  /** Even when false, expert declarations are never treated as verified credentials in M1. */
  verificationRequired: boolean;
}

export interface CapacityCondition {
  min: number | null;
  max: number | null;
}

export interface FeeCondition {
  amountJpy: number;
  note: string | null;
}

export interface TransportCondition {
  modes: readonly string[];
  accessNote: string | null;
}

/** Participation conditions pinned to a specific Activity revision. */
export interface ParticipationCondition {
  id: string;
  target: { activityId: string; activityRevision: number };
  schedule: ScheduleCondition;
  skills: ConditionFieldState<readonly SkillRequirement[]>;
  qualifications: ConditionFieldState<readonly QualificationRequirement[]>;
  capacity: ConditionFieldState<CapacityCondition>;
  fee: ConditionFieldState<FeeCondition>;
  itemsToBring: ConditionFieldState<readonly string[]>;
  transport: ConditionFieldState<TransportCondition>;
  ageOrOtherConstraints: ConditionFieldState<string>;
  itemsToConfirm: readonly string[];
  /** Required for public-catalog activities and must reference an existing SourceDocument. */
  sourceId: string | null;
}

export type ResourceCategory = 'labor' | 'skill' | 'tool' | 'material' | 'venue' | 'other';

export interface ResourceQuantity {
  count: number;
  unit: string;
}

/** Structured resource requirement pinned to an Activity revision or CollaborationCase revision. */
export interface ResourceRequirement {
  id: string;
  owner: { kind: 'activity' | 'case'; id: string; revision: number };
  category: ResourceCategory;
  title: string;
  quantity: ConditionFieldState<ResourceQuantity>;
  required: boolean;
  note: string | null;
  sourceId: string | null;
}

/** Skill declaration never certifies qualification verification on its own (D01/D05). */
export interface ActorSkillDeclaration {
  id: string;
  actorId: string;
  label: string;
  declarationType: 'self-declared' | 'source-cited';
  qualificationStatus: 'unverified';
  evidence: string | null;
}

export interface LocationConditionsGraph extends ActorProvenanceGraph {
  locations: readonly ActivityLocation[];
  participationConditions: readonly ParticipationCondition[];
  resourceRequirements: readonly ResourceRequirement[];
  actorSkills: readonly ActorSkillDeclaration[];
}

export interface PreliminaryReadinessSummary {
  /** M1 never decides participation eligibility or credential verification from distance/expertise alone. */
  status: 'requires-matching-and-human-review';
  canParticipate: null;
  qualificationVerified: false;
  actorId: string;
  activityId: string;
  activityRevision: number;
  distanceMeters: number | null;
  locationCount: number;
  locationPrecisions: readonly LocationPrecision[];
  missingLocationCount: number;
  nonSpecifiedConditionFields: readonly { field: string; state: 'not-stated' | 'unknown' | 'no-restriction' }[];
  itemsToConfirm: readonly string[];
  disclaimers: readonly string[];
}

const VALID_PRECISIONS: readonly LocationPrecision[] = ['venue', 'approximate', 'administrative-area', 'unknown'];
const VALID_GRANULARITIES: readonly PublicGranularity[] = ['venue', 'district', 'municipality', 'prefecture', 'withheld'];
const VALID_CATEGORIES: readonly ResourceCategory[] = ['labor', 'skill', 'tool', 'material', 'venue', 'other'];

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function text(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function keys(value: object, allowed: readonly string[]) {
  check(Object.keys(value).every((k) => allowed.includes(k)), 'Unexpected location/condition field');
}

function uniqueIds(ids: readonly string[], label: string) {
  check(ids.every(text) && new Set(ids).size === ids.length, `Invalid or duplicate ${label} ID`);
}

function validateDay(v: string) {
  check(
    /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Invalid confirmation date'
  );
}

function validateIsoTimestamp(v: string) {
  check(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)),
    'Invalid schedule timestamp'
  );
}

function validateTimeZone(tz: string) {
  check(text(tz), 'Invalid timeZone');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new Error('Invalid timeZone');
  }
}

function validateGeoPoint(point: GeoPoint4326) {
  keys(point, ['srid', 'latitude', 'longitude']);
  check(point.srid === 4326, 'SRID must be 4326');
  check(
    typeof point.latitude === 'number' && Number.isFinite(point.latitude) && point.latitude >= -90 && point.latitude <= 90,
    'Invalid latitude'
  );
  check(
    typeof point.longitude === 'number' && Number.isFinite(point.longitude) && point.longitude >= -180 && point.longitude <= 180,
    'Invalid longitude'
  );
}

function validateConditionField<T>(field: ConditionFieldState<T>, validateSpecified: (value: T) => void) {
  check(field && typeof field === 'object', 'Invalid condition field');
  if (field.state === 'not-stated') {
    keys(field, ['state']);
    return;
  }
  if (field.state === 'unknown' || field.state === 'no-restriction') {
    keys(field, ['state', 'note']);
    check(field.note === undefined || field.note === null || text(field.note), 'Invalid condition note');
    return;
  }
  if (field.state === 'specified') {
    keys(field, ['state', 'value']);
    validateSpecified(field.value);
    return;
  }
  throw new Error('Invalid condition state');
}

/** Pure domain validation for D05 locations, participation conditions, resource requirements, and skill declarations. */
export function validateLocationConditionsGraph(graph: LocationConditionsGraph): void {
  validateActorProvenanceGraph(graph);

  uniqueIds(graph.locations.map((l) => l.id), 'location');
  uniqueIds(graph.participationConditions.map((c) => c.id), 'participation condition');
  uniqueIds(graph.resourceRequirements.map((r) => r.id), 'resource requirement');
  uniqueIds(graph.actorSkills.map((s) => s.id), 'actor skill');

  const sources = new Set(graph.sources.map((s) => s.id));
  const actors = new Map(graph.actors.map((a) => [a.id, a]));
  const cases = new Map(graph.cases.map((c) => [c.id, c]));
  const findActivityRev = (id: string, rev: number) =>
    graph.activityRevisions.find((r) => r.id === id && r.revision === rev);

  // 1. Activity locations (multiple sites per revision supported)
  for (const loc of graph.locations) {
    keys(loc, [
      'id',
      'activityId',
      'activityRevision',
      'label',
      'coordinates',
      'precision',
      'publicGranularity',
      'acquisitionBasis',
      'confirmedOn',
      'sourceId'
    ]);
    const actRev = findActivityRev(loc.activityId, loc.activityRevision);
    check(actRev, 'Unknown activity revision for location');
    check(text(loc.label), 'Empty location label');
    check(VALID_PRECISIONS.includes(loc.precision), 'Invalid location precision');
    check(VALID_GRANULARITIES.includes(loc.publicGranularity), 'Invalid public granularity');
    check(text(loc.acquisitionBasis), 'Empty acquisitionBasis');

    if (loc.coordinates === null) {
      // Missing coordinates are valid and retained as null
    } else {
      check(loc.precision !== 'unknown', 'Unknown precision must keep coordinates null');
      validateGeoPoint(loc.coordinates);
    }

    if (loc.confirmedOn !== null) validateDay(loc.confirmedOn);
    if (loc.sourceId !== null) check(sources.has(loc.sourceId), 'Missing location source');
    if (actRev.domain === 'public-catalog') {
      check(loc.sourceId !== null && sources.has(loc.sourceId), 'Public location requires source');
    }
  }

  // 2. Participation conditions pinned to activity revisions
  const conditionTargets = new Set<string>();
  for (const cond of graph.participationConditions) {
    keys(cond, [
      'id',
      'target',
      'schedule',
      'skills',
      'qualifications',
      'capacity',
      'fee',
      'itemsToBring',
      'transport',
      'ageOrOtherConstraints',
      'itemsToConfirm',
      'sourceId'
    ]);
    keys(cond.target, ['activityId', 'activityRevision']);
    const actRev = findActivityRev(cond.target.activityId, cond.target.activityRevision);
    check(actRev, 'Unknown activity revision for participation condition');

    const targetKey = JSON.stringify([cond.target.activityId, cond.target.activityRevision]);
    check(!conditionTargets.has(targetKey), 'Duplicate participation condition for activity revision');
    conditionTargets.add(targetKey);

    keys(cond.schedule, ['timeZone', 'dates', 'timeWindowNote']);
    validateTimeZone(cond.schedule.timeZone);
    validateConditionField(cond.schedule.dates, (slots) => {
      check(Array.isArray(slots) && slots.length > 0, 'Empty schedule slots');
      for (const slot of slots) {
        keys(slot, ['startAt', 'endAt', 'label']);
        validateIsoTimestamp(slot.startAt);
        if (slot.endAt !== null) {
          validateIsoTimestamp(slot.endAt);
          check(Date.parse(slot.endAt) >= Date.parse(slot.startAt), 'Schedule endAt precedes startAt');
        }
        check(slot.label === null || text(slot.label), 'Invalid schedule slot label');
      }
    });
    validateConditionField(cond.schedule.timeWindowNote, (note) => check(text(note), 'Empty timeWindowNote'));

    validateConditionField(cond.skills, (items) => {
      check(Array.isArray(items) && items.length > 0, 'Empty skill conditions');
      for (const item of items) {
        keys(item, ['label', 'required']);
        check(text(item.label) && typeof item.required === 'boolean', 'Invalid skill requirement');
      }
    });

    validateConditionField(cond.qualifications, (items) => {
      check(Array.isArray(items) && items.length > 0, 'Empty qualification conditions');
      for (const item of items) {
        keys(item, ['name', 'verificationRequired']);
        check(text(item.name) && typeof item.verificationRequired === 'boolean', 'Invalid qualification requirement');
      }
    });

    validateConditionField(cond.capacity, (cap) => {
      keys(cap, ['min', 'max']);
      check(cap.min !== null || cap.max !== null, 'Specified capacity requires min or max');
      if (cap.min !== null) check(Number.isSafeInteger(cap.min) && cap.min >= 0, 'Invalid capacity min');
      if (cap.max !== null) check(Number.isSafeInteger(cap.max) && cap.max > 0, 'Invalid capacity max');
      if (cap.min !== null && cap.max !== null) check(cap.max >= cap.min, 'Capacity max below min');
    });

    validateConditionField(cond.fee, (fee) => {
      keys(fee, ['amountJpy', 'note']);
      check(Number.isSafeInteger(fee.amountJpy) && fee.amountJpy >= 0, 'Invalid fee amount');
      check(fee.note === null || text(fee.note), 'Invalid fee note');
    });

    validateConditionField(cond.itemsToBring, (items) => {
      check(Array.isArray(items) && items.length > 0 && items.every(text), 'Invalid itemsToBring');
    });

    validateConditionField(cond.transport, (tr) => {
      keys(tr, ['modes', 'accessNote']);
      check(Array.isArray(tr.modes) && tr.modes.length > 0 && tr.modes.every(text), 'Invalid transport modes');
      check(tr.accessNote === null || text(tr.accessNote), 'Invalid transport accessNote');
    });

    validateConditionField(cond.ageOrOtherConstraints, (v) => check(text(v), 'Empty ageOrOtherConstraints'));
    check(Array.isArray(cond.itemsToConfirm) && cond.itemsToConfirm.every(text), 'Invalid itemsToConfirm');

    if (cond.sourceId !== null) check(sources.has(cond.sourceId), 'Missing condition source');
    if (actRev.domain === 'public-catalog') {
      check(cond.sourceId !== null && sources.has(cond.sourceId), 'Public condition requires source');
    }
  }

  // 3. Resource requirements pinned to activity revision or case revision
  for (const req of graph.resourceRequirements) {
    keys(req, ['id', 'owner', 'category', 'title', 'quantity', 'required', 'note', 'sourceId']);
    keys(req.owner, ['kind', 'id', 'revision']);
    check(VALID_CATEGORIES.includes(req.category), 'Invalid resource category');
    check(text(req.title) && typeof req.required === 'boolean', 'Invalid resource requirement');
    check(req.note === null || text(req.note), 'Invalid resource note');

    let isPublicOwner = false;
    if (req.owner.kind === 'activity') {
      const actRev = findActivityRev(req.owner.id, req.owner.revision);
      check(actRev, 'Unknown activity revision for resource requirement');
      isPublicOwner = actRev.domain === 'public-catalog';
    } else if (req.owner.kind === 'case') {
      const c = cases.get(req.owner.id);
      check(c && c.revision === req.owner.revision, 'Unknown case revision for resource requirement');
    } else {
      throw new Error('Invalid resource owner kind');
    }

    validateConditionField(req.quantity, (qty) => {
      keys(qty, ['count', 'unit']);
      check(Number.isSafeInteger(qty.count) && qty.count > 0 && text(qty.unit), 'Invalid resource quantity');
    });

    if (req.sourceId !== null) check(sources.has(req.sourceId), 'Missing resource source');
    if (isPublicOwner) {
      check(req.sourceId !== null && sources.has(req.sourceId), 'Public resource requirement requires source');
    }
  }

  // 4. Actor skill declarations (never imply verified qualification)
  for (const skill of graph.actorSkills) {
    keys(skill, ['id', 'actorId', 'label', 'declarationType', 'qualificationStatus', 'evidence']);
    check(actors.has(skill.actorId), 'Unknown actor for skill declaration');
    check(text(skill.label), 'Empty skill label');
    check(skill.declarationType === 'self-declared' || skill.declarationType === 'source-cited', 'Invalid declarationType');
    check(skill.qualificationStatus === 'unverified', 'M1 skill declarations cannot assert verified qualifications');
    if (skill.declarationType === 'source-cited') {
      check(text(skill.evidence), 'Source-cited skill requires evidence');
    } else {
      check(skill.evidence === null || text(skill.evidence), 'Invalid skill evidence');
    }
  }
}

/** Appends an ActivityLocation without mutating the input graph or location payload. */
export function appendActivityLocation(
  graph: LocationConditionsGraph,
  location: ActivityLocation
): LocationConditionsGraph {
  validateLocationConditionsGraph(graph);
  const next: LocationConditionsGraph = structuredClone({
    ...graph,
    locations: [...graph.locations, location]
  });
  validateLocationConditionsGraph(next);
  return next;
}

/** Appends a ParticipationCondition pinned to an Activity revision without mutating past revisions. */
export function appendParticipationCondition(
  graph: LocationConditionsGraph,
  condition: ParticipationCondition
): LocationConditionsGraph {
  validateLocationConditionsGraph(graph);
  const next: LocationConditionsGraph = structuredClone({
    ...graph,
    participationConditions: [...graph.participationConditions, condition]
  });
  validateLocationConditionsGraph(next);
  return next;
}

/** Appends a ResourceRequirement without mutating the input graph. */
export function appendResourceRequirement(
  graph: LocationConditionsGraph,
  requirement: ResourceRequirement
): LocationConditionsGraph {
  validateLocationConditionsGraph(graph);
  const next: LocationConditionsGraph = structuredClone({
    ...graph,
    resourceRequirements: [...graph.resourceRequirements, requirement]
  });
  validateLocationConditionsGraph(next);
  return next;
}

/**
 * Summarizes location/condition readiness facts without deciding participation eligibility
 * or credential verification. Distance and expert attributes never confer eligibility (D05).
 */
export function summarizeParticipationReadiness(
  graph: LocationConditionsGraph,
  params: { actorId: string; activityId: string; activityRevision: number; distanceMeters?: number | null }
): PreliminaryReadinessSummary {
  validateLocationConditionsGraph(graph);
  const actor = graph.actors.find((a) => a.id === params.actorId);
  check(actor, 'Unknown actor');
  const actRev = graph.activityRevisions.find(
    (r) => r.id === params.activityId && r.revision === params.activityRevision
  );
  check(actRev, 'Unknown activity revision');
  const dist = params.distanceMeters ?? null;
  if (dist !== null) check(typeof dist === 'number' && Number.isFinite(dist) && dist >= 0, 'Invalid distanceMeters');

  const locs = graph.locations.filter(
    (l) => l.activityId === params.activityId && l.activityRevision === params.activityRevision
  );
  const cond = graph.participationConditions.find(
    (c) => c.target.activityId === params.activityId && c.target.activityRevision === params.activityRevision
  );

  const nonSpecified: { field: string; state: 'not-stated' | 'unknown' | 'no-restriction' }[] = [];
  if (cond) {
    const entries: [string, ConditionFieldState<unknown>][] = [
      ['schedule.dates', cond.schedule.dates],
      ['schedule.timeWindowNote', cond.schedule.timeWindowNote],
      ['skills', cond.skills],
      ['qualifications', cond.qualifications],
      ['capacity', cond.capacity],
      ['fee', cond.fee],
      ['itemsToBring', cond.itemsToBring],
      ['transport', cond.transport],
      ['ageOrOtherConstraints', cond.ageOrOtherConstraints]
    ];
    for (const [field, value] of entries) {
      if (value.state !== 'specified') nonSpecified.push({ field, state: value.state });
    }
  }

  return {
    status: 'requires-matching-and-human-review',
    canParticipate: null,
    qualificationVerified: false,
    actorId: actor.id,
    activityId: actRev.id,
    activityRevision: actRev.revision,
    distanceMeters: dist,
    locationCount: locs.length,
    locationPrecisions: locs.map((l) => l.precision),
    missingLocationCount: locs.filter((l) => l.coordinates === null).length,
    nonSpecifiedConditionFields: nonSpecified,
    itemsToConfirm: cond ? [...cond.itemsToConfirm] : [],
    disclaimers: [
      '距離や移動条件の近接だけで参加可能と断定しない（M2推薦・人間確認が必要）。',
      '専門家属性や技能申告だけで資格確認済みとしない。'
    ]
  };
}
