import { describe, expect, it } from 'vitest';
import type { Actor } from '../packages/domain/src/m1';
import {
  appendActivityRevision,
  type SourceDocument
} from '../packages/domain/src/provenance';
import {
  appendActivityLocation,
  appendParticipationCondition,
  appendResourceRequirement,
  summarizeParticipationReadiness,
  validateLocationConditionsGraph,
  type ActivityLocation,
  type LocationConditionsGraph,
  type ParticipationCondition,
  type ResourceRequirement
} from '../packages/domain/src/location-conditions';

const makeSource = (id = 'src-1'): SourceDocument => ({
  id,
  url: `https://example.invalid/loc/${id}`,
  publisher: '架空テスト発行者',
  title: `テスト出典 ${id}`,
  accessedOn: '2026-11-25',
  publishedOn: null,
  updatedOn: null,
  summary: 'テスト専用出典（実在データではない）',
  urlStatus: 'unchecked',
  usage: { status: 'unchecked', evidence: null }
});

const simActor: Actor = {
  id: 'sim-expert-1',
  domain: 'simulation',
  kind: 'person',
  displayName: '架空模擬専門家',
  expertise: [{ label: 'チェーンソー取扱', evidence: '自己申告のみ' }]
};

const makeLocation = (overrides: Partial<ActivityLocation> = {}): ActivityLocation => ({
  id: 'loc-1',
  activityId: 'act-pub',
  activityRevision: 1,
  label: '集合拠点A（テスト）',
  coordinates: { srid: 4326, latitude: 35.0116, longitude: 135.7681 },
  precision: 'approximate',
  publicGranularity: 'municipality',
  acquisitionBasis: '公開資料の地名記載から代表点取得（テスト）',
  confirmedOn: '2026-11-25',
  sourceId: 'src-1',
  ...overrides
});

const makeCondition = (overrides: Partial<ParticipationCondition> = {}): ParticipationCondition => ({
  id: 'cond-r1',
  target: { activityId: 'act-pub', activityRevision: 1 },
  schedule: {
    timeZone: 'Asia/Tokyo',
    dates: {
      state: 'specified',
      value: [{ startAt: '2026-12-05T09:00:00+09:00', endAt: '2026-12-05T15:00:00+09:00', label: '午前・午後' }]
    },
    timeWindowNote: { state: 'unknown', note: '雨天時の変更条件は未確認' }
  },
  skills: { state: 'specified', value: [{ label: '下草刈り', required: false }] },
  qualifications: { state: 'not-stated' },
  capacity: { state: 'specified', value: { min: 2, max: 15 } },
  fee: { state: 'no-restriction', note: '参加費無料と記載' },
  itemsToBring: { state: 'specified', value: ['軍手', '長靴'] },
  transport: { state: 'specified', value: { modes: ['bus', 'car'], accessNote: '最寄りバス停から徒歩15分（テスト）' } },
  ageOrOtherConstraints: { state: 'unknown', note: '未成年単独参加の可否は要確認' },
  itemsToConfirm: ['雨天中止の連絡方法', '道具貸出の可否'],
  sourceId: 'src-1',
  ...overrides
});

const makeResource = (overrides: Partial<ResourceRequirement> = {}): ResourceRequirement => ({
  id: 'res-1',
  owner: { kind: 'activity', id: 'act-pub', revision: 1 },
  category: 'tool',
  title: '刈払機（テスト）',
  quantity: { state: 'specified', value: { count: 2, unit: '台' } },
  required: true,
  note: '安全装備別途確認',
  sourceId: 'src-1',
  ...overrides
});

const makeGraph = (): LocationConditionsGraph => ({
  actors: [simActor],
  actorRevisions: [{ actor: simActor, revision: 1 }],
  actorAssertions: [],
  memberships: [],
  activities: [
    { id: 'act-pub', domain: 'public-catalog', revision: 1, title: '公開テスト活動v1' },
    { id: 'act-sim', domain: 'simulation', revision: 1, title: '架空模擬活動v1' }
  ],
  activityRevisions: [
    { id: 'act-pub', domain: 'public-catalog', revision: 1, title: '公開テスト活動v1' },
    { id: 'act-sim', domain: 'simulation', revision: 1, title: '架空模擬活動v1' }
  ],
  activityParties: [],
  cases: [
    {
      mode: 'simulation',
      id: 'case-1',
      activity: { id: 'act-pub', domain: 'public-catalog', revision: 1 },
      revision: 1,
      stage: 'draft',
      parties: [{ actorId: simActor.id, role: 'candidate' }]
    }
  ],
  interests: [],
  needs: [],
  sources: [makeSource('src-1')],
  assertions: [
    {
      id: 'asrt-1',
      target: { activityId: 'act-pub', revision: 1, field: 'title' },
      sourceId: 'src-1',
      value: '公開テスト活動v1',
      status: 'unverified',
      checkedBy: null,
      checkedAt: null
    }
  ],
  locations: [makeLocation()],
  participationConditions: [makeCondition()],
  resourceRequirements: [makeResource()],
  actorSkills: [
    {
      id: 'skill-1',
      actorId: simActor.id,
      label: 'チェーンソー特別教育（自己申告）',
      declarationType: 'self-declared',
      qualificationStatus: 'unverified',
      evidence: null
    }
  ]
});

describe('M1-04 (#6) Locations: SRID 4326, coordinate ranges, missing null, and multiple sites', () => {
  it('supports multiple sites per activity revision including null coordinates for unknown location', () => {
    const g = makeGraph();
    const withSecondSite = appendActivityLocation(
      g,
      makeLocation({
        id: 'loc-2-missing',
        label: '作業エリアB（位置未特定）',
        coordinates: null,
        precision: 'unknown',
        publicGranularity: 'withheld',
        acquisitionBasis: '公開資料に位置記載なし',
        confirmedOn: null
      })
    );
    expect(() => validateLocationConditionsGraph(withSecondSite)).not.toThrow();
    expect(withSecondSite.locations).toHaveLength(2);
    expect(withSecondSite.locations[1].coordinates).toBeNull();
    expect(withSecondSite.locations[1].precision).toBe('unknown');
    // Original graph remains unmutated
    expect(g.locations).toHaveLength(1);
  });

  it('rejects non-4326 SRID, out-of-range/NaN coordinates, unknown precision with coordinates, and missing public source', () => {
    const g = makeGraph();

    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        locations: [makeLocation({ coordinates: { srid: 3857 as unknown as 4326, latitude: 35, longitude: 135 } })]
      })
    ).toThrow('SRID must be 4326');

    for (const badLat of [-90.1, 90.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        validateLocationConditionsGraph({
          ...g,
          locations: [makeLocation({ coordinates: { srid: 4326, latitude: badLat, longitude: 135 } })]
        })
      ).toThrow('Invalid latitude');
    }

    for (const badLon of [-180.1, 180.1, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(() =>
        validateLocationConditionsGraph({
          ...g,
          locations: [makeLocation({ coordinates: { srid: 4326, latitude: 35, longitude: badLon } })]
        })
      ).toThrow('Invalid longitude');
    }

    // Precision 'unknown' must not hold fabricated coordinates like (0, 0)
    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        locations: [makeLocation({ precision: 'unknown', coordinates: { srid: 4326, latitude: 0, longitude: 0 } })]
      })
    ).toThrow('Unknown precision must keep coordinates null');

    // Public activity location requires an existing SourceDocument
    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        locations: [makeLocation({ sourceId: null })]
      })
    ).toThrow('Public location requires source');

    // Invalid confirmation calendar date
    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        locations: [makeLocation({ confirmedOn: '2026-02-30' })]
      })
    ).toThrow('Invalid confirmation date');
  });
});

describe('M1-04 (#6) Participation conditions, schedule/timezone, resource requirements, and revision pinning', () => {
  it('distinguishes not-stated, unknown, no-restriction, and specified states and pins conditions across activity revisions', () => {
    const g1 = makeGraph();
    const rev2Base = appendActivityRevision(
      g1,
      { id: 'act-pub', domain: 'public-catalog', revision: 2, title: '公開テスト活動v2' },
      [makeSource('src-2')],
      [
        {
          id: 'asrt-2',
          target: { activityId: 'act-pub', revision: 2, field: 'title' },
          sourceId: 'src-2',
          value: '公開テスト活動v2',
          status: 'unverified',
          checkedBy: null,
          checkedAt: null
        }
      ]
    );
    const g2Base: LocationConditionsGraph = {
      ...g1,
      ...rev2Base
    };
    const g2 = appendParticipationCondition(
      g2Base,
      makeCondition({
        id: 'cond-r2',
        target: { activityId: 'act-pub', activityRevision: 2 },
        qualifications: { state: 'specified', value: [{ name: '刈払機取扱作業者', verificationRequired: true }] },
        fee: { state: 'specified', value: { amountJpy: 500, note: '保険料実費（テスト）' } },
        sourceId: 'src-2'
      })
    );
    const g2WithCaseRes = appendResourceRequirement(
      g2,
      makeResource({
        id: 'res-case-1',
        owner: { kind: 'case', id: 'case-1', revision: 1 },
        category: 'labor',
        title: '作業補助スタッフ（模擬案件）',
        quantity: { state: 'unknown', note: '調整中' },
        sourceId: null
      })
    );

    expect(() => validateLocationConditionsGraph(g2WithCaseRes)).not.toThrow();
    expect(g2WithCaseRes.participationConditions).toHaveLength(2);
    expect(g2WithCaseRes.participationConditions[0].qualifications.state).toBe('not-stated');
    expect(g2WithCaseRes.participationConditions[0].fee.state).toBe('no-restriction');
    expect(g2WithCaseRes.participationConditions[0].ageOrOtherConstraints.state).toBe('unknown');
    expect(g2WithCaseRes.participationConditions[1].qualifications.state).toBe('specified');
    expect(g2WithCaseRes.participationConditions[1].target.activityRevision).toBe(2);
    expect(g2WithCaseRes.resourceRequirements).toHaveLength(2);
  });

  it('rejects invalid timezone, reversed schedule timestamps, invalid capacity/fee, duplicate revision conditions, and unknown revision targets', () => {
    const g = makeGraph();

    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        participationConditions: [makeCondition({ schedule: { ...makeCondition().schedule, timeZone: 'Mars/Olympus' } })]
      })
    ).toThrow('Invalid timeZone');

    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        participationConditions: [
          makeCondition({
            schedule: {
              timeZone: 'Asia/Tokyo',
              dates: {
                state: 'specified',
                value: [{ startAt: '2026-12-05T15:00:00+09:00', endAt: '2026-12-05T09:00:00+09:00', label: null }]
              },
              timeWindowNote: { state: 'not-stated' }
            }
          })
        ]
      })
    ).toThrow('Schedule endAt precedes startAt');

    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        participationConditions: [makeCondition({ capacity: { state: 'specified', value: { min: 10, max: 5 } } })]
      })
    ).toThrow('Capacity max below min');

    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        participationConditions: [makeCondition({ fee: { state: 'specified', value: { amountJpy: -100, note: null } } })]
      })
    ).toThrow('Invalid fee amount');

    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        participationConditions: [makeCondition(), makeCondition({ id: 'cond-dup' })]
      })
    ).toThrow('Duplicate participation condition');

    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        participationConditions: [makeCondition({ target: { activityId: 'act-pub', activityRevision: 99 } })]
      })
    ).toThrow('Unknown activity revision');

    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        resourceRequirements: [makeResource({ sourceId: null })]
      })
    ).toThrow('Public resource requirement requires source');
  });
});

describe('M1-04 (#6) Non-assumption of eligibility or verified qualification from distance or expert attributes', () => {
  it('rejects skill declarations claiming verified qualification and never infers participation eligibility from 0m distance or expertise', () => {
    const g = makeGraph();

    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        actorSkills: [
          {
            ...g.actorSkills[0],
            qualificationStatus: 'verified' as unknown as 'unverified'
          }
        ]
      })
    ).toThrow('cannot assert verified qualifications');

    expect(() =>
      validateLocationConditionsGraph({
        ...g,
        actorSkills: [
          {
            ...g.actorSkills[0],
            declarationType: 'source-cited',
            evidence: null
          }
        ]
      })
    ).toThrow('Source-cited skill requires evidence');

    // Even at distanceMeters=0 with an actor carrying expertise & skill declarations,
    // readiness summary never sets canParticipate=true or qualificationVerified=true.
    const summary = summarizeParticipationReadiness(g, {
      actorId: simActor.id,
      activityId: 'act-pub',
      activityRevision: 1,
      distanceMeters: 0
    });
    expect(summary.status).toBe('requires-matching-and-human-review');
    expect(summary.canParticipate).toBeNull();
    expect(summary.qualificationVerified).toBe(false);
    expect(summary.distanceMeters).toBe(0);
    expect(summary.locationPrecisions).toEqual(['approximate']);
    expect(summary.nonSpecifiedConditionFields).toEqual([
      { field: 'schedule.timeWindowNote', state: 'unknown' },
      { field: 'qualifications', state: 'not-stated' },
      { field: 'fee', state: 'no-restriction' },
      { field: 'ageOrOtherConstraints', state: 'unknown' }
    ]);
    expect(summary.itemsToConfirm).toEqual(['雨天中止の連絡方法', '道具貸出の可否']);
  });
});
