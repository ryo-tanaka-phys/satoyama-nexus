import {
  applyMaterialCaseChange,
  createCollaborationDraft,
  executeWithAtomicAudit,
  exportCatalogWithActors,
  recordHumanReview,
  transitionSimulationCase,
  validateGovernedDomainState,
  type Activity,
  type ActivityLocation,
  type Actor,
  type ActorRevision,
  type AtomicAuditStorePort,
  type AuditEvent,
  type CollaborationStage,
  type GovernedDomainState,
  type LocationConditionsGraph,
  type MaterialChangeKind,
  type ParticipationCondition,
  type ResourceRequirement,
  type ServerAuthContext
} from '@satoyama/domain';
import {
  DEFAULT_PROVISIONAL_MATCHING_POLICY,
  recommendSimulationCandidates,
  type ActorMatchingProfile,
  type MatchRecommendation
} from '@satoyama/matching';
import {
  appendAIRecommendation,
  deterministicPrimaryReviewer,
  getCaseReviewReadiness,
  type CaseReviewReadiness,
  type StructuredPrimaryAssessment
} from '@satoyama/ai-review';
import simulatedProfilesFixture from '../../../data/fixtures/simulated-profiles.json';
import publicActivitiesFixture from '../../../data/fixtures/public-activities.json';

export type DemoPersonaId = 'creator' | 'reviewer' | 'coordinator' | 'anonymous';

export interface DemoPersonaDescriptor {
  id: DemoPersonaId;
  label: string;
  accountId: string | null;
  roles: readonly string[];
  description: string;
}

export interface SimulationCollaborationNote {
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

export const DEMO_PERSONAS: readonly DemoPersonaDescriptor[] = [
  {
    id: 'creator',
    label: '案件作成・編集者（自己レビュー禁止の確認用）',
    accountId: 'acct-sim-creator',
    roles: ['simulation-editor', 'reviewer'],
    description: '模擬案件の作成・重要変更が可能。reviewer 権限を持つが、自身の作成・変更案件への承認は SELF_REVIEW_PROHIBITED で拒否されます。'
  },
  {
    id: 'reviewer',
    label: '第三者二次審査者（承認・却下の実行用）',
    accountId: 'acct-human-reviewer',
    roles: ['reviewer', 'auditor'],
    description: '案件作成者・当事者から独立した第三者レビュアー。AI一次推奨を確認し、理由付きで二次審査を追記できます。'
  },
  {
    id: 'coordinator',
    label: '協働進行担当（段階遷移・重要変更の実行用）',
    accountId: 'acct-coordinator',
    roles: ['simulation-editor'],
    description: '人間の二次承認後に模擬依頼 → 調整 → 合意 → 実施準備の順次遷移および重要条件変更を実行できます。'
  },
  {
    id: 'anonymous',
    label: '未認証ユーザー（認証拒否・監査記録の確認用）',
    accountId: null,
    roles: [],
    description: '未認証コンテキスト。すべての保護操作が UNAUTHENTICATED で拒否され、denied 監査ログが残ります。'
  }
];

export function resolveServerAuthContext(personaId: DemoPersonaId, nowIso: string): ServerAuthContext {
  switch (personaId) {
    case 'creator':
      return {
        authenticated: true,
        userAccountId: 'acct-sim-creator',
        grants: [
          { role: 'simulation-editor', scope: { kind: 'global' }, revokedAt: null, expiresAt: null },
          { role: 'reviewer', scope: { kind: 'global' }, revokedAt: null, expiresAt: null }
        ],
        operatedActorIds: ['sim-org-001'],
        issuedAt: nowIso
      };
    case 'reviewer':
      return {
        authenticated: true,
        userAccountId: 'acct-human-reviewer',
        grants: [
          { role: 'reviewer', scope: { kind: 'global' }, revokedAt: null, expiresAt: null },
          { role: 'auditor', scope: { kind: 'global' }, revokedAt: null, expiresAt: null }
        ],
        operatedActorIds: [],
        issuedAt: nowIso
      };
    case 'coordinator':
      return {
        authenticated: true,
        userAccountId: 'acct-coordinator',
        grants: [{ role: 'simulation-editor', scope: { kind: 'global' }, revokedAt: null, expiresAt: null }],
        operatedActorIds: [],
        issuedAt: nowIso
      };
    case 'anonymous':
    default:
      return { authenticated: false };
  }
}

export function buildInitialSeed(): {
  state: GovernedDomainState;
  actorProfiles: ActorMatchingProfile[];
} {
  const fixtureFirst = simulatedProfilesFixture[0];
  const simActors: Actor[] = [
    {
      id: fixtureFirst?.id ?? 'sim-person-001',
      domain: 'simulation',
      kind: 'person',
      displayName: fixtureFirst?.displayName ?? '模擬参加者 A',
      expertise: (fixtureFirst?.skills ?? ['植生観察']).map((s) => ({ label: s, evidence: null }))
    },
    {
      id: 'sim-person-002',
      domain: 'simulation',
      kind: 'person',
      displayName: '模擬参加者 B（森林整備・安全担当モデル）',
      expertise: [
        { label: '竹林整備', evidence: null },
        { label: '植生観察', evidence: null },
        { label: '安全管理補助', evidence: null }
      ]
    },
    {
      id: 'sim-org-001',
      domain: 'simulation',
      kind: 'organization',
      displayName: '模擬市民団体「里山保全テストの会」',
      expertise: [
        { label: '地域調整', evidence: null },
        { label: '竹林整備', evidence: null }
      ]
    },
    {
      id: 'sim-gov-001',
      domain: 'simulation',
      kind: 'government-body',
      displayName: '模擬自治体窓口（実証シナリオ用）',
      expertise: [{ label: '公有林利用案内', evidence: null }]
    }
  ];

  const actorRevisions: ActorRevision[] = simActors.map((actor) => ({ actor, revision: 1 }));

  const simActivities: Activity[] = [
    {
      id: 'sim-act-001',
      domain: 'simulation',
      revision: 1,
      title: '【模擬】里山竹林整備・植生調査の協働案'
    },
    {
      id: 'sim-act-002',
      domain: 'simulation',
      revision: 1,
      title: '【模擬】水辺モニタリングと自然観察サポート案'
    }
  ];

  const locations: ActivityLocation[] = [
    {
      id: 'loc-sim-001-a',
      activityId: 'sim-act-001',
      activityRevision: 1,
      label: '【模擬】北側里山林エリア（概算地点）',
      coordinates: { srid: 4326, latitude: 35.6329, longitude: 139.2615 },
      precision: 'approximate',
      publicGranularity: 'municipality',
      acquisitionBasis: 'Phase 1 模擬シナリオの概算座標（実在地点の募集ではない）',
      confirmedOn: null,
      sourceId: null
    },
    {
      id: 'loc-sim-001-b',
      activityId: 'sim-act-001',
      activityRevision: 1,
      label: '【模擬】資材保管小屋（座標未設定・欠損保持デモ）',
      coordinates: null,
      precision: 'unknown',
      publicGranularity: 'withheld',
      acquisitionBasis: '位置欠損を null のまま保持する検証用レコード',
      confirmedOn: null,
      sourceId: null
    },
    {
      id: 'loc-sim-002-a',
      activityId: 'sim-act-002',
      activityRevision: 1,
      label: '【模擬】渓流観察区画（行政区域レベル）',
      coordinates: { srid: 4326, latitude: 35.721, longitude: 139.182 },
      precision: 'administrative-area',
      publicGranularity: 'municipality',
      acquisitionBasis: 'Phase 1 模擬シナリオの広域概算座標',
      confirmedOn: null,
      sourceId: null
    }
  ];

  const participationConditions: ParticipationCondition[] = [
    {
      id: 'cond-sim-001',
      target: { activityId: 'sim-act-001', activityRevision: 1 },
      schedule: {
        timeZone: 'Asia/Tokyo',
        dates: {
          state: 'specified',
          value: [
            {
              startAt: '2026-12-06T09:30:00+09:00',
              endAt: '2026-12-06T15:00:00+09:00',
              label: '模擬作業日（午前：竹林整備 / 午後：植生記録）'
            }
          ]
        },
        timeWindowNote: { state: 'specified', value: '雨天時は模擬日程を再調整' }
      },
      skills: {
        state: 'specified',
        value: [
          { label: '竹林整備', required: true },
          { label: '植生観察', required: true },
          { label: '安全管理補助', required: false }
        ]
      },
      qualifications: {
        state: 'specified',
        value: [{ name: '刈払機取扱安全衛生教育（模擬確認項目）', verificationRequired: true }]
      },
      capacity: { state: 'specified', value: { min: 2, max: 10 } },
      fee: { state: 'no-restriction', note: '参加費無料（模擬設定）' },
      itemsToBring: { state: 'specified', value: ['軍手', '長袖・長ズボン', '飲み物'] },
      transport: {
        state: 'specified',
        value: {
          modes: ['地域バス', '自家用車', '徒歩'],
          accessNote: '最寄りバス停から徒歩約15分（模擬設定）'
        }
      },
      ageOrOtherConstraints: { state: 'unknown', note: 'ボランティア保険の適用年齢条件は人間審査で確認' },
      itemsToConfirm: [
        '当日の集合場所（座標未設定の資材小屋を含む）と雨天中止基準を確認する',
        '刈払機等の安全講習修了有無は自己申告のみのため人間審査で確認する'
      ],
      sourceId: null
    },
    {
      id: 'cond-sim-002',
      target: { activityId: 'sim-act-002', activityRevision: 1 },
      schedule: {
        timeZone: 'Asia/Tokyo',
        dates: { state: 'not-stated' },
        timeWindowNote: { state: 'unknown', note: '天候と水量を見て模擬日程を調整予定' }
      },
      skills: {
        state: 'specified',
        value: [{ label: '植生観察', required: true }]
      },
      qualifications: { state: 'not-stated' },
      capacity: { state: 'specified', value: { min: 1, max: 6 } },
      fee: { state: 'no-restriction', note: null },
      itemsToBring: { state: 'specified', value: ['長靴', '記録用ノート'] },
      transport: {
        state: 'specified',
        value: { modes: ['電車', '地域バス'], accessNote: null }
      },
      ageOrOtherConstraints: { state: 'no-restriction', note: null },
      itemsToConfirm: ['開催日時が未記載（not-stated）のため調整段階で確定する'],
      sourceId: null
    }
  ];

  const resourceRequirements: ResourceRequirement[] = [
    {
      id: 'res-sim-001',
      owner: { kind: 'activity', id: 'sim-act-001', revision: 1 },
      category: 'skill',
      title: '竹林整備',
      quantity: { state: 'specified', value: { count: 2, unit: '名' } },
      required: true,
      note: '安全確保のため経験申告者を優先確認',
      sourceId: null
    },
    {
      id: 'res-sim-002',
      owner: { kind: 'activity', id: 'sim-act-001', revision: 1 },
      category: 'tool',
      title: '竹挽きノコギリ・保護眼鏡',
      quantity: { state: 'specified', value: { count: 4, unit: 'セット' } },
      required: false,
      note: '模擬団体側からの貸出想定',
      sourceId: null
    }
  ];

  const baseGraph: LocationConditionsGraph = {
    actors: simActors,
    memberships: [
      { personId: 'sim-person-002', organizationId: 'sim-org-001', evidence: null }
    ],
    activities: simActivities,
    activityRevisions: simActivities,
    activityParties: [
      { activityId: 'sim-act-001', actorId: 'sim-org-001', role: '模擬主催団体' },
      { activityId: 'sim-act-002', actorId: 'sim-gov-001', role: '模擬フィールド案内' }
    ],
    cases: [],
    interests: [],
    needs: [
      {
        id: 'need-sim-001',
        owner: { kind: 'activity', id: 'sim-act-001', revision: 1 },
        description: '放置竹林の整備と林床植生の変化記録を協働で進めたい（模擬ニーズ）'
      }
    ],
    sources: [],
    assertions: [],
    actorRevisions,
    actorAssertions: [],
    locations,
    participationConditions,
    resourceRequirements,
    actorSkills: [
      {
        id: 'skill-decl-001',
        actorId: 'sim-person-001',
        label: '植生観察',
        declarationType: 'self-declared',
        qualificationStatus: 'unverified',
        evidence: null
      },
      {
        id: 'skill-decl-002',
        actorId: 'sim-person-002',
        label: '竹林整備',
        declarationType: 'self-declared',
        qualificationStatus: 'unverified',
        evidence: null
      },
      {
        id: 'skill-decl-003',
        actorId: 'sim-person-002',
        label: '植生観察',
        declarationType: 'self-declared',
        qualificationStatus: 'unverified',
        evidence: null
      }
    ]
  };

  const initialDraft = createCollaborationDraft(
    baseGraph,
    'sim-case-001',
    { id: 'sim-act-001', domain: 'simulation', revision: 1 },
    [
      { actorId: 'sim-org-001', role: '模擬主催' },
      { actorId: 'sim-person-002', role: '模擬協働候補' }
    ]
  );

  const graphWithCase: LocationConditionsGraph = {
    ...baseGraph,
    cases: [initialDraft],
    interests: [
      { mode: 'simulation', caseId: initialDraft.id, actorId: 'sim-person-002', kind: 'interest' }
    ]
  };

  const state: GovernedDomainState = {
    graph: graphWithCase,
    caseGovernance: [
      {
        caseId: initialDraft.id,
        createdByAccountId: 'acct-sim-creator',
        lastMaterialChangeByAccountId: null,
        lastMaterialChangeRevision: 1
      }
    ],
    aiRecommendations: [],
    reviewRecords: [],
    auditEvents: [],
    processedOperationIds: []
  };

  validateGovernedDomainState(state);

  const actorProfiles: ActorMatchingProfile[] = [
    {
      actorId: fixtureFirst?.id ?? 'sim-person-001',
      baseCoordinates: { srid: 4326, latitude: 35.6612, longitude: 139.3185 },
      availableTransportModes: ['電車', '地域バス', '徒歩'],
      willingness: 'open',
      note: '週末の観察活動に関心あり（模擬設定）'
    },
    {
      actorId: 'sim-person-002',
      baseCoordinates: { srid: 4326, latitude: 35.6401, longitude: 139.2704 },
      availableTransportModes: ['自家用車', '地域バス'],
      willingness: 'explicit-interest',
      note: '竹林整備と植生調査の両方に参加希望（模擬設定）'
    },
    {
      actorId: 'sim-org-001',
      baseCoordinates: { srid: 4326, latitude: 35.635, longitude: 139.265 },
      availableTransportModes: ['自家用車', '徒歩'],
      willingness: 'open',
      note: '現地主催モデル（模擬設定）'
    },
    {
      actorId: 'sim-gov-001',
      baseCoordinates: null,
      availableTransportModes: [],
      willingness: 'unknown',
      note: '拠点座標・移動手段未登録（欠損挙動確認用）'
    }
  ];

  return { state, actorProfiles };
}

export interface WorkbenchSnapshot {
  phaseNotice: string;
  persistence: {
    mode: 'postgis' | 'in-memory';
    spatialEngine: 'PostGIS ST_Distance' | 'Haversine fallback';
    label: string;
  };
  publicCatalog: ReturnType<typeof exportCatalogWithActors> & {
    fixtureActivityCount: number;
  };
  personas: readonly DemoPersonaDescriptor[];
  matchingPolicy: typeof DEFAULT_PROVISIONAL_MATCHING_POLICY;
  selectedActivityId: string;
  simulationActors: readonly Actor[];
  actorProfiles: readonly ActorMatchingProfile[];
  simulationActivities: readonly Activity[];
  locations: readonly ActivityLocation[];
  participationConditions: readonly ParticipationCondition[];
  resourceRequirements: readonly ResourceRequirement[];
  recommendations: readonly MatchRecommendation[];
  cases: readonly GovernedDomainState['graph']['cases'][number][];
  caseGovernance: GovernedDomainState['caseGovernance'];
  caseReadiness: Readonly<Record<string, CaseReviewReadiness>>;
  aiRecommendations: GovernedDomainState['aiRecommendations'];
  aiAssessments: readonly StructuredPrimaryAssessment[];
  reviewRecords: GovernedDomainState['reviewRecords'];
  auditEvents: GovernedDomainState['auditEvents'];
  collaborationNotes: readonly SimulationCollaborationNote[];
}

export class SimulationWorkbench {
  private state: GovernedDomainState;
  private actorProfiles: ActorMatchingProfile[];
  private aiAssessments: StructuredPrimaryAssessment[] = [];
  private collaborationNotes: SimulationCollaborationNote[] = [];
  private opSeq = 1;
  private clockOverride?: () => string;

  constructor(options?: { now?: () => string }) {
    this.clockOverride = options?.now;
    const seed = buildInitialSeed();
    this.state = seed.state;
    this.actorProfiles = seed.actorProfiles;
  }

  private nowIso(): string {
    return this.clockOverride ? this.clockOverride() : new Date().toISOString();
  }

  private nextOpId(prefix: string): string {
    return `${prefix}-${this.opSeq++}`;
  }

  private createStorePort(): AtomicAuditStorePort {
    return {
      runTransaction: async (fn) => {
        let candidateState: GovernedDomainState | null = null;
        const result = await fn({
          saveBusinessState: async (nextState) => {
            candidateState = structuredClone(nextState);
          },
          appendAuditEvent: async () => {
            // Audit event is already included in candidateState.auditEvents
          }
        });
        if (candidateState) {
          this.state = candidateState;
        }
        return result;
      },
      persistDeniedAudit: async (deniedEvent: AuditEvent) => {
        const nextState: GovernedDomainState = structuredClone({
          ...this.state,
          auditEvents: [...this.state.auditEvents, deniedEvent]
        });
        validateGovernedDomainState(nextState);
        this.state = nextState;
      }
    };
  }

  reset(): WorkbenchSnapshot {
    const seed = buildInitialSeed();
    this.state = seed.state;
    this.actorProfiles = seed.actorProfiles;
    this.aiAssessments = [];
    this.collaborationNotes = [];
    this.opSeq = 1;
    return this.getSnapshot();
  }

  getState(): GovernedDomainState {
    return structuredClone(this.state);
  }

  getRecommendationsForActivity(activityId: string): readonly MatchRecommendation[] {
    const activity = this.state.graph.activities.find((a) => a.id === activityId);
    if (!activity) return [];
    return recommendSimulationCandidates({
      graph: this.state.graph,
      activityId: activity.id,
      activityRevision: activity.revision,
      actorProfiles: this.actorProfiles,
      policy: DEFAULT_PROVISIONAL_MATCHING_POLICY
    });
  }

  getSnapshot(selectedActivityId?: string): WorkbenchSnapshot {
    const simActivities = this.state.graph.activities.filter((a) => a.domain === 'simulation');
    const resolvedActivityId =
      selectedActivityId && simActivities.some((a) => a.id === selectedActivityId)
        ? selectedActivityId
        : simActivities[0]?.id ?? '';

    const recommendations = resolvedActivityId
      ? this.getRecommendationsForActivity(resolvedActivityId)
      : [];

    const caseReadiness: Record<string, CaseReviewReadiness> = {};
    for (const c of this.state.graph.cases) {
      caseReadiness[c.id] = getCaseReviewReadiness(this.state, c.id);
    }

    return {
      phaseNotice: 'Phase 1：すべての依頼・応答・調整・合意・実施準備は模擬処理です。外部への実連絡・実AI呼出は行いません。',
      persistence: {
        mode: 'in-memory',
        spatialEngine: 'Haversine fallback',
        label: 'メモリ動作（DATABASE_URL 未設定のため再起動で初期化）'
      },
      publicCatalog: {
        ...exportCatalogWithActors(this.state.graph),
        fixtureActivityCount: publicActivitiesFixture.length
      },
      personas: DEMO_PERSONAS,
      matchingPolicy: DEFAULT_PROVISIONAL_MATCHING_POLICY,
      selectedActivityId: resolvedActivityId,
      simulationActors: this.state.graph.actors.filter((a) => a.domain === 'simulation'),
      actorProfiles: structuredClone(this.actorProfiles),
      simulationActivities: simActivities,
      locations: structuredClone(this.state.graph.locations),
      participationConditions: structuredClone(this.state.graph.participationConditions),
      resourceRequirements: structuredClone(this.state.graph.resourceRequirements),
      recommendations,
      cases: structuredClone(this.state.graph.cases),
      caseGovernance: structuredClone(this.state.caseGovernance),
      caseReadiness,
      aiRecommendations: structuredClone(this.state.aiRecommendations),
      aiAssessments: structuredClone(this.aiAssessments),
      reviewRecords: structuredClone(this.state.reviewRecords),
      auditEvents: structuredClone(this.state.auditEvents),
      collaborationNotes: structuredClone(this.collaborationNotes)
    };
  }

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
      /** Local Asia/Tokyo datetime from <input type="datetime-local"> (YYYY-MM-DDTHH:mm). */
      scheduleStartAt?: string | null;
    }
  ): { ok: true; activity: Activity; snapshot: WorkbenchSnapshot } | { ok: false; reasonCode: string; message: string } {
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

    const id = `sim-act-${String(this.state.graph.activities.length + 1).padStart(3, '0')}`;
    const activity: Activity = {
      id,
      domain: 'simulation',
      revision: 1,
      title: title.startsWith('【模擬】') ? title : `【模擬】${title}`
    };

    const hasLat = typeof input.latitude === 'number' && Number.isFinite(input.latitude);
    const hasLng = typeof input.longitude === 'number' && Number.isFinite(input.longitude);
    if (hasLat !== hasLng) {
      return { ok: false, reasonCode: 'INVALID_LOCATION', message: '緯度と経度は両方入力するか、両方空欄にしてください。' };
    }
    if (
      hasLat &&
      ((input.latitude as number) < -90 || (input.latitude as number) > 90 ||
        (input.longitude as number) < -180 || (input.longitude as number) > 180)
    ) {
      return { ok: false, reasonCode: 'INVALID_LOCATION', message: '緯度は -90〜90、経度は -180〜180 の範囲で入力してください。' };
    }
    const hasCoords = hasLat && hasLng;

    const rawStart = input.scheduleStartAt?.trim() ?? '';
    let scheduleStartIso: string | null = null;
    if (rawStart) {
      const candidate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawStart) ? `${rawStart}:00+09:00` : rawStart;
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(candidate) || !Number.isFinite(Date.parse(candidate))) {
        return { ok: false, reasonCode: 'INVALID_SCHEDULE', message: '活動日時の形式が正しくありません。' };
      }
      scheduleStartIso = candidate;
    }

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
    const cleanConfirm = (input.itemsToConfirm ?? [])
      .map((s) => s.trim())
      .filter(Boolean);

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
        cleanConfirm.length > 0
          ? cleanConfirm
          : ['活動日程・安全配慮・参加条件を運営者の二次審査で確認する'],
      sourceId: null
    };

    const nextState: GovernedDomainState = structuredClone({
      ...this.state,
      graph: {
        ...this.state.graph,
        activities: [...this.state.graph.activities, activity],
        activityRevisions: [...this.state.graph.activityRevisions, activity],
        locations: [...this.state.graph.locations, loc],
        participationConditions: [...this.state.graph.participationConditions, cond]
      }
    });
    validateGovernedDomainState(nextState);
    this.state = nextState;

    return { ok: true, activity, snapshot: this.getSnapshot(activity.id) };
  }

  createDraftCase(
    personaId: DemoPersonaId,
    input: { activityId: string; candidateActorId: string; role?: string }
  ): { ok: true; caseId: string; snapshot: WorkbenchSnapshot } | { ok: false; reasonCode: string; message: string } {
    const nowIso = this.nowIso();
    const auth = resolveServerAuthContext(personaId, nowIso);
    if (!auth.authenticated || !auth.grants.some((g) => g.role === 'simulation-editor')) {
      return {
        ok: false,
        reasonCode: auth.authenticated ? 'FORBIDDEN_SCOPE_OR_ROLE' : 'UNAUTHENTICATED',
        message: '模擬案件の作成には simulation-editor 権限が必要です。'
      };
    }

    const activity = this.state.graph.activities.find((a) => a.id === input.activityId);
    if (!activity) {
      return { ok: false, reasonCode: 'UNKNOWN_ACTIVITY', message: '対象の活動が見つかりません。' };
    }
    const candidate = this.state.graph.actors.find((a) => a.id === input.candidateActorId);
    if (!candidate || candidate.domain !== 'simulation') {
      return {
        ok: false,
        reasonCode: 'SIMULATION_ACTORS_ONLY',
        message: '公開カタログ主体ではなく模擬アクターのみ模擬案件に割り当て可能です。'
      };
    }

    const caseId = `sim-case-${String(this.state.graph.cases.length + 1).padStart(3, '0')}`;
    const parties =
      candidate.id === 'sim-org-001'
        ? [{ actorId: candidate.id, role: input.role?.trim() || '模擬協働候補' }]
        : [
            { actorId: 'sim-org-001', role: '模擬主催' },
            { actorId: candidate.id, role: input.role?.trim() || '模擬協働候補' }
          ];

    const draft = createCollaborationDraft(
      this.state.graph,
      caseId,
      { id: activity.id, domain: activity.domain, revision: activity.revision },
      parties
    );

    const nextState: GovernedDomainState = structuredClone({
      ...this.state,
      graph: {
        ...this.state.graph,
        cases: [...this.state.graph.cases, draft]
      },
      caseGovernance: [
        ...this.state.caseGovernance,
        {
          caseId,
          createdByAccountId: auth.userAccountId,
          lastMaterialChangeByAccountId: null,
          lastMaterialChangeRevision: 1
        }
      ]
    });
    validateGovernedDomainState(nextState);
    this.state = nextState;

    return { ok: true, caseId, snapshot: this.getSnapshot(activity.id) };
  }

  async runAIPrimaryReview(
    caseId: string
  ): Promise<
    | { ok: true; assessment: StructuredPrimaryAssessment; snapshot: WorkbenchSnapshot }
    | { ok: false; reasonCode: string; message: string }
  > {
    const targetCase = this.state.graph.cases.find((c) => c.id === caseId);
    if (!targetCase) {
      return { ok: false, reasonCode: 'UNKNOWN_CASE', message: '対象の模擬案件が見つかりません。' };
    }

    const allRecs = this.getRecommendationsForActivity(targetCase.activity.id);
    const partyIds = new Set(targetCase.parties.map((p) => p.actorId));
    const matchingEvidence = allRecs.filter((r) => partyIds.has(r.actorId));

    const recId = `ai-rec-${this.state.aiRecommendations.length + 1}-${targetCase.id}-r${targetCase.revision}`;
    const assessment = await deterministicPrimaryReviewer.evaluateCase({
      state: this.state,
      caseId: targetCase.id,
      recommendationId: recId,
      generatedAt: this.nowIso(),
      matchingEvidence
    });

    this.state = appendAIRecommendation(this.state, assessment);
    this.aiAssessments = [...this.aiAssessments, assessment];

    return {
      ok: true,
      assessment,
      snapshot: this.getSnapshot(targetCase.activity.id)
    };
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
    const nowIso = this.nowIso();
    const auth = resolveServerAuthContext(personaId, nowIso);
    const opId = this.nextOpId('op-review');
    const corrId = `corr-${opId}`;

    const cmd = recordHumanReview(
      this.state,
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

    const persisted = await executeWithAtomicAudit(this.createStorePort(), cmd);
    const targetCase = this.state.graph.cases.find((c) => c.id === input.caseId);
    const snapshot = this.getSnapshot(targetCase?.activity.id);

    if (!persisted.ok) {
      return {
        ok: false,
        reasonCode: persisted.reasonCode,
        message: persisted.message,
        deniedAuditEvent: persisted.deniedAuditEvent,
        snapshot
      };
    }
    return { ok: true, auditEvent: persisted.auditEvent, snapshot };
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
    const nowIso = this.nowIso();
    const auth = resolveServerAuthContext(personaId, nowIso);
    const opId = this.nextOpId('op-change');
    const corrId = `corr-${opId}`;
    const existingCase = this.state.graph.cases.find((c) => c.id === input.caseId);

    let nextParties = existingCase?.parties;
    if (existingCase && input.addActorId && !existingCase.parties.some((p) => p.actorId === input.addActorId)) {
      nextParties = [...existingCase.parties, { actorId: input.addActorId, role: '模擬追加候補' }];
    }

    const cmd = applyMaterialCaseChange(
      this.state,
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

    const persisted = await executeWithAtomicAudit(this.createStorePort(), cmd);
    const targetCase = this.state.graph.cases.find((c) => c.id === input.caseId);
    const snapshot = this.getSnapshot(targetCase?.activity.id);

    if (!persisted.ok) {
      return {
        ok: false,
        reasonCode: persisted.reasonCode,
        message: persisted.message,
        deniedAuditEvent: persisted.deniedAuditEvent,
        snapshot
      };
    }
    return { ok: true, auditEvent: persisted.auditEvent, snapshot };
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
    const nowIso = this.nowIso();
    const auth = resolveServerAuthContext(personaId, nowIso);
    const opId = this.nextOpId('op-stage');
    const corrId = `corr-${opId}`;
    const prevCase = this.state.graph.cases.find((c) => c.id === input.caseId);

    const cmd = transitionSimulationCase(
      this.state,
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

    const persisted = await executeWithAtomicAudit(this.createStorePort(), cmd);
    const targetCase = this.state.graph.cases.find((c) => c.id === input.caseId);

    if (persisted.ok && prevCase && targetCase && auth.authenticated) {
      const defaultNoteByStage: Record<CollaborationStage, string> = {
        draft: '模擬下書きを作成',
        requested: '模擬依頼を発行（外部への実連絡なし）',
        responded: '模擬応答を記録（候補者の参加意向回答を模擬・外部連絡なし）',
        coordinating: '日程および安全条件の模擬調整を記録（外部連絡なし）',
        agreed: '模擬合意を記録（法的拘束・実在主体の同意なし）',
        preparing: '模擬実施準備チェックリストを確認（Phase 1 完了段階）'
      };
      this.collaborationNotes = [
        ...this.collaborationNotes,
        {
          id: `note-${this.collaborationNotes.length + 1}`,
          mode: 'simulation',
          externalContactSent: false,
          caseId: targetCase.id,
          caseRevision: targetCase.revision,
          fromStage: prevCase.stage,
          toStage: targetCase.stage,
          actorAccountId: auth.userAccountId,
          note: input.simulationNote?.trim() || defaultNoteByStage[targetCase.stage],
          recordedAt: nowIso
        }
      ];
    }

    const snapshot = this.getSnapshot(targetCase?.activity.id);
    if (!persisted.ok) {
      return {
        ok: false,
        reasonCode: persisted.reasonCode,
        message: persisted.message,
        deniedAuditEvent: persisted.deniedAuditEvent,
        snapshot
      };
    }
    return { ok: true, auditEvent: persisted.auditEvent, snapshot };
  }
}

export function createSimulationWorkbench(options?: { now?: () => string }): SimulationWorkbench {
  return new SimulationWorkbench(options);
}

const globalForWorkbench = globalThis as unknown as {
  __satoyamaWorkbench?: SimulationWorkbench;
};

export function getWorkbench(): SimulationWorkbench {
  if (!globalForWorkbench.__satoyamaWorkbench) {
    globalForWorkbench.__satoyamaWorkbench = createSimulationWorkbench();
  }
  return globalForWorkbench.__satoyamaWorkbench;
}
