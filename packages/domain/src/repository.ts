import type {
  Activity,
  Actor,
  CollaborationCase,
  SourceAssertion,
  SourceDocument,
  ActorRevision,
  ActorSourceAssertion,
  ActivityLocation,
  LocationPrecision,
  ParticipationCondition,
  ResourceRequirement,
  AIRecommendationRecord,
  AuditEvent,
  CaseGovernanceRecord,
  ReviewRecord
} from './index';

export interface SpatialDistanceQueryResult {
  locationId: string;
  activityId: string;
  activityRevision: number;
  label: string;
  precision: LocationPrecision;
  publicGranularity: ActivityLocation['publicGranularity'];
  /** Null when coordinates are missing in DB; never fabricated. */
  distanceMeters: number | null;
}

export interface PersistedM1Snapshot {
  sources: readonly SourceDocument[];
  publicActivities: readonly Activity[];
  publicActivityRevisions: readonly Activity[];
  publicAssertions: readonly SourceAssertion[];
  publicActors: readonly Actor[];
  publicActorRevisions: readonly ActorRevision[];
  publicActorAssertions: readonly ActorSourceAssertion[];
  locations: readonly ActivityLocation[];
  participationConditions: readonly ParticipationCondition[];
  resourceRequirements: readonly ResourceRequirement[];
  simulationActors: readonly Actor[];
  simulationActivities: readonly Activity[];
  cases: readonly CollaborationCase[];
  caseGovernance: readonly CaseGovernanceRecord[];
  aiRecommendations: readonly AIRecommendationRecord[];
  reviewRecords: readonly ReviewRecord[];
  auditEvents: readonly AuditEvent[];
}

export interface AtomicCaseMutation {
  operationId: string;
  caseId: string;
  expectedVersion: number;
  nextRevision: number;
  nextStage: CollaborationCase['stage'];
  auditEvent: AuditEvent;
  reviewRecord?: ReviewRecord;
  /** Optional fault-injection hook used solely in transactional rollback tests. */
  beforeAuditCommit?: () => Promise<void>;
}

/**
 * SDK/DB-free Repository boundary for M1 persistence (D08).
 * Concrete PostgreSQL/PostGIS adapters live outside packages/domain.
 */
export interface M1DomainRepository {
  saveSourceDocument(source: SourceDocument): Promise<void>;
  savePublicActivityRevision(activity: Activity, assertions: readonly SourceAssertion[]): Promise<void>;
  savePublicActorRevision(revision: ActorRevision, assertions: readonly ActorSourceAssertion[]): Promise<void>;
  saveActivityLocation(location: ActivityLocation): Promise<void>;
  saveParticipationCondition(condition: ParticipationCondition): Promise<void>;
  saveResourceRequirement(requirement: ResourceRequirement): Promise<void>;
  saveSimulationActor(actor: Actor): Promise<void>;
  saveSimulationActivityRevision(activity: Activity): Promise<void>;
  saveCollaborationCase(
    value: CollaborationCase,
    governance: CaseGovernanceRecord,
    aiRecommendations?: readonly AIRecommendationRecord[]
  ): Promise<void>;
  queryLocationsByDistance(params: {
    latitude: number;
    longitude: number;
    maxDistanceMeters?: number;
  }): Promise<readonly SpatialDistanceQueryResult[]>;
  commitAtomicCaseMutation(
    mutation: AtomicCaseMutation
  ): Promise<{ applied: true; idempotentReplay: boolean } | { applied: false; reason: 'VERSION_CONFLICT' }>;
  appendDeniedAuditEvent(event: AuditEvent): Promise<void>;
  loadSnapshot(): Promise<PersistedM1Snapshot>;
}
