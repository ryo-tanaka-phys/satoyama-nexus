import { describe, expect, it } from 'vitest';
import type { Actor } from '../../packages/domain/src/m1';
import {
  validateProvenanceGraph,
  type ProvenanceGraph,
  type SourceAssertion,
  type SourceDocument
} from '../../packages/domain/src/provenance';
import {
  validateActorProvenanceGraph,
  type ActorProvenanceGraph,
  type ActorSourceAssertion
} from '../../packages/domain/src/actor-provenance';

const makeSource = (id: string, overrides: Partial<SourceDocument> = {}): SourceDocument => ({
  id,
  url: `https://example.invalid/doc/${id}`,
  publisher: '架空テスト発行者',
  title: `テスト資料 ${id}`,
  accessedOn: '2026-11-25',
  publishedOn: null,
  updatedOn: null,
  summary: `テスト専用出典 ${id}`,
  urlStatus: 'unchecked',
  usage: { status: 'unchecked', evidence: null },
  ...overrides
});

const pubActor: Actor = {
  id: 'pub-actor-1',
  domain: 'public-catalog',
  kind: 'organization',
  displayName: '公開テスト団体',
  expertise: [{ label: '森林保全', evidence: null }]
};

const simActor: Actor = {
  id: 'sim-actor-1',
  domain: 'simulation',
  kind: 'person',
  displayName: '架空模擬個人',
  expertise: []
};

const makeActorAssertions = (sourceId = 'src-1'): ActorSourceAssertion[] => [
  {
    id: 'aa-name',
    target: { actorId: pubActor.id, revision: 1, field: 'displayName' },
    sourceId,
    value: pubActor.displayName,
    status: 'unverified',
    checkedBy: null,
    checkedAt: null
  },
  {
    id: 'aa-kind',
    target: { actorId: pubActor.id, revision: 1, field: 'kind' },
    sourceId,
    value: pubActor.kind,
    status: 'unverified',
    checkedBy: null,
    checkedAt: null
  },
  {
    id: 'aa-exp',
    target: { actorId: pubActor.id, revision: 1, field: 'expertise' },
    sourceId,
    value: JSON.stringify(pubActor.expertise),
    status: 'unverified',
    checkedBy: null,
    checkedAt: null
  }
];

const makeGraph = (): ActorProvenanceGraph => ({
  actors: [pubActor, simActor],
  actorRevisions: [
    { actor: pubActor, revision: 1 },
    { actor: simActor, revision: 1 }
  ],
  actorAssertions: makeActorAssertions('src-1'),
  memberships: [],
  activities: [
    { id: 'act-pub', domain: 'public-catalog', revision: 1, title: '公開テスト活動' },
    { id: 'act-sim', domain: 'simulation', revision: 1, title: '架空模擬活動' }
  ],
  activityRevisions: [
    { id: 'act-pub', domain: 'public-catalog', revision: 1, title: '公開テスト活動' },
    { id: 'act-sim', domain: 'simulation', revision: 1, title: '架空模擬活動' }
  ],
  activityParties: [],
  cases: [],
  interests: [],
  needs: [],
  sources: [makeSource('src-1'), makeSource('src-2'), makeSource('src-3')],
  assertions: [
    {
      id: 'act-title-1',
      target: { activityId: 'act-pub', revision: 1, field: 'title' },
      sourceId: 'src-1',
      value: '公開テスト活動',
      status: 'unverified',
      checkedBy: null,
      checkedAt: null
    }
  ]
});

describe('17-02 Review metadata (checkedBy/checkedAt) and status boundaries for Activity & Actor', () => {
  it('rejects half-missing checkedBy/checkedAt, invalid timestamps, and unreviewed conflicting assertions', () => {
    const g = makeGraph();

    // Activity: half-missing reviewer/timestamp even when status is unverified
    expect(() =>
      validateProvenanceGraph({
        ...g,
        assertions: [{ ...g.assertions[0], checkedBy: 'reviewer-1', checkedAt: null }]
      })
    ).toThrow('Invalid assertion review');
    expect(() =>
      validateProvenanceGraph({
        ...g,
        assertions: [{ ...g.assertions[0], checkedBy: null, checkedAt: '2026-11-25T00:00:00Z' }]
      })
    ).toThrow('Invalid assertion review');

    // Activity: conflicting without reviewer/timestamp
    expect(() =>
      validateProvenanceGraph({
        ...g,
        assertions: [
          ...g.assertions,
          { ...g.assertions[0], id: 'act-conflict-no-rev', value: '別表記', status: 'conflicting' }
        ]
      })
    ).toThrow('Assertion review required');

    // Activity: date-only (missing time T) or invalid ISO timestamp or blank checkedBy
    for (const badReview of [
      { checkedBy: 'reviewer-1', checkedAt: '2026-11-25' },
      { checkedBy: 'reviewer-1', checkedAt: '2026-11-25T99:99:99Z' },
      { checkedBy: '   ', checkedAt: '2026-11-25T00:00:00Z' }
    ]) {
      expect(() =>
        validateProvenanceGraph({
          ...g,
          assertions: [{ ...g.assertions[0], status: 'confirmed', ...badReview }]
        })
      ).toThrow('Invalid assertion review');
    }

    // Actor: half-missing reviewer/timestamp even when status is unverified
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actorAssertions: [{ ...g.actorAssertions[0], checkedBy: 'reviewer-1', checkedAt: null }, ...g.actorAssertions.slice(1)]
      })
    ).toThrow('Invalid actor assertion review');
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actorAssertions: [
          { ...g.actorAssertions[0], checkedBy: null, checkedAt: '2026-11-25T00:00:00Z' },
          ...g.actorAssertions.slice(1)
        ]
      })
    ).toThrow('Invalid actor assertion review');

    // Actor: conflicting without reviewer/timestamp
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actorAssertions: [
          ...g.actorAssertions,
          { ...g.actorAssertions[0], id: 'aa-conflict-no-rev', value: '矛盾団体名', status: 'conflicting' }
        ]
      })
    ).toThrow('Actor assertion review required');

    // Actor: invalid timestamp format (missing T)
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actorAssertions: [
          { ...g.actorAssertions[0], status: 'confirmed', checkedBy: 'reviewer-1', checkedAt: '2026-11-25' },
          ...g.actorAssertions.slice(1)
        ]
      })
    ).toThrow('Invalid actor assertion review');
  });

  it('retains multiple sources and conflicting assertions on the same field without collapsing or promoting unverified', () => {
    const g = makeGraph();
    const multiSource: ActorProvenanceGraph = {
      ...g,
      assertions: [
        {
          ...g.assertions[0],
          status: 'confirmed',
          checkedBy: 'reviewer-a',
          checkedAt: '2026-11-25T01:00:00Z'
        },
        {
          id: 'act-title-conflict-1',
          target: { activityId: 'act-pub', revision: 1, field: 'title' },
          sourceId: 'src-2',
          value: '別出典タイトルA',
          status: 'conflicting',
          checkedBy: 'reviewer-a',
          checkedAt: '2026-11-25T01:05:00Z'
        },
        {
          id: 'act-title-conflict-2',
          target: { activityId: 'act-pub', revision: 1, field: 'title' },
          sourceId: 'src-3',
          value: '別出典タイトルB',
          status: 'conflicting',
          checkedBy: 'reviewer-b',
          checkedAt: '2026-11-25T01:10:00Z'
        },
        {
          id: 'act-recruit-unverified',
          target: { activityId: 'act-pub', revision: 1, field: 'recruitment' },
          sourceId: 'src-2',
          value: 'unknown',
          status: 'unverified',
          checkedBy: 'reviewer-a',
          checkedAt: '2026-11-25T01:15:00Z'
        }
      ],
      actorAssertions: [
        ...g.actorAssertions,
        {
          id: 'aa-name-conflict-1',
          target: { actorId: pubActor.id, revision: 1, field: 'displayName' },
          sourceId: 'src-2',
          value: '別表記団体名',
          status: 'conflicting',
          checkedBy: 'reviewer-a',
          checkedAt: '2026-11-25T01:20:00Z'
        },
        {
          id: 'aa-exp-conflict-1',
          target: { actorId: pubActor.id, revision: 1, field: 'expertise' },
          sourceId: 'src-3',
          value: JSON.stringify([{ label: '別専門表記', evidence: null }]),
          status: 'conflicting',
          checkedBy: 'reviewer-b',
          checkedAt: '2026-11-25T01:25:00Z'
        }
      ]
    };

    expect(() => validateActorProvenanceGraph(multiSource)).not.toThrow();
    expect(multiSource.assertions.filter((a) => a.target.field === 'title')).toHaveLength(3);
    expect(multiSource.assertions.find((a) => a.id === 'act-recruit-unverified')?.status).toBe('unverified');
    expect(multiSource.actorAssertions.filter((a) => a.target.field === 'displayName')).toHaveLength(2);
    expect(multiSource.sources.every((s) => s.urlStatus === 'unchecked' && s.usage.status === 'unchecked')).toBe(true);
  });
});

describe('17-02 Cross-target, SourceDocument, and Activity/Actor provenance isolation boundaries', () => {
  it('rejects assertions targeting simulation entities, nonexistent targets, mismatched values, and cross-domain fields', () => {
    const g = makeGraph();

    // Activity assertion targeting simulation activity
    expect(() =>
      validateProvenanceGraph({
        ...g,
        assertions: [
          ...g.assertions,
          {
            id: 'sim-target',
            target: { activityId: 'act-sim', revision: 1, field: 'title' },
            sourceId: 'src-1',
            value: '架空模擬活動',
            status: 'unverified',
            checkedBy: null,
            checkedAt: null
          }
        ]
      })
    ).toThrow('Unknown public assertion target');

    // Activity assertion targeting nonexistent revision
    expect(() =>
      validateProvenanceGraph({
        ...g,
        assertions: [
          ...g.assertions,
          {
            id: 'bad-rev-target',
            target: { activityId: 'act-pub', revision: 2, field: 'title' },
            sourceId: 'src-1',
            value: '存在しない版',
            status: 'unverified',
            checkedBy: null,
            checkedAt: null
          }
        ]
      })
    ).toThrow('Unknown public assertion target');

    // Activity title assertion value does not match actual activity title
    expect(() =>
      validateProvenanceGraph({
        ...g,
        assertions: [{ ...g.assertions[0], value: '別タイトルのみ' }]
      })
    ).toThrow('Public activity requires title provenance');

    // Cross-domain field name: actor field passed to activity assertion
    expect(() =>
      validateProvenanceGraph({
        ...g,
        assertions: [
          ...g.assertions,
          {
            id: 'wrong-field-act',
            target: { activityId: 'act-pub', revision: 1, field: 'displayName' as unknown as SourceAssertion['target']['field'] },
            sourceId: 'src-1',
            value: '公開テスト活動',
            status: 'unverified',
            checkedBy: null,
            checkedAt: null
          }
        ]
      })
    ).toThrow('Invalid assertion field');

    // Actor assertion targeting simulation actor
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actorAssertions: [
          ...g.actorAssertions,
          {
            id: 'sim-actor-target',
            target: { actorId: simActor.id, revision: 1, field: 'displayName' },
            sourceId: 'src-1',
            value: simActor.displayName,
            status: 'unverified',
            checkedBy: null,
            checkedAt: null
          }
        ]
      })
    ).toThrow('Unknown public actor revision');

    // Cross-domain field name: activity field passed to actor assertion
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actorAssertions: [
          ...g.actorAssertions,
          {
            id: 'wrong-field-actor',
            target: { actorId: pubActor.id, revision: 1, field: 'title' as unknown as ActorSourceAssertion['target']['field'] },
            sourceId: 'src-1',
            value: pubActor.displayName,
            status: 'unverified',
            checkedBy: null,
            checkedAt: null
          }
        ]
      })
    ).toThrow('Invalid actor assertion field');

    // Actor expertise assertion value mismatch
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actorAssertions: g.actorAssertions.map((a) =>
          a.target.field === 'expertise' ? { ...a, value: '[]' } : a
        )
      })
    ).toThrow('Public actor requires field provenance');

    // Blank assertion values rejected for both Activity and Actor
    expect(() =>
      validateProvenanceGraph({
        ...g,
        assertions: [
          ...g.assertions,
          { id: 'blank-act-val', target: { activityId: 'act-pub', revision: 1, field: 'summary' }, sourceId: 'src-1', value: '   ', status: 'unverified', checkedBy: null, checkedAt: null }
        ]
      })
    ).toThrow('Missing assertion source/value');
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actorAssertions: [
          ...g.actorAssertions,
          { id: 'blank-actor-val', target: { actorId: pubActor.id, revision: 1, field: 'displayName' }, sourceId: 'src-1', value: '   ', status: 'unverified', checkedBy: null, checkedAt: null }
        ]
      })
    ).toThrow('Missing actor assertion source/value');
  });

  it('rejects duplicate SourceDocument/Assertion IDs, invalid optional dates, restricted usage without evidence, and enforces Activity/Actor provenance independence', () => {
    const g = makeGraph();

    // Positive control: shared SourceDocument with valid publishedOn/updatedOn and restricted+evidence
    const validWithDates: ProvenanceGraph = {
      ...g,
      sources: [
        makeSource('src-1', {
          publishedOn: '2026-11-20',
          updatedOn: '2026-11-24',
          usage: { status: 'restricted', evidence: '引用範囲のみ可（架空テスト記載）' }
        })
      ]
    };
    expect(() => validateProvenanceGraph(validWithDates)).not.toThrow();

    // Duplicate SourceDocument ID
    expect(() =>
      validateProvenanceGraph({
        ...g,
        sources: [makeSource('src-1'), makeSource('src-1')]
      })
    ).toThrow('Invalid provenance IDs');

    // Duplicate Activity Assertion ID and Actor Assertion ID
    expect(() =>
      validateProvenanceGraph({
        ...g,
        assertions: [g.assertions[0], g.assertions[0]]
      })
    ).toThrow('Invalid provenance IDs');
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actorAssertions: [...g.actorAssertions, g.actorAssertions[0]]
      })
    ).toThrow('Invalid actor assertion ID');

    // Invalid publishedOn / updatedOn calendar dates
    expect(() =>
      validateProvenanceGraph({
        ...g,
        sources: [makeSource('src-1', { publishedOn: '2026-04-31' })]
      })
    ).toThrow('Invalid source date');
    expect(() =>
      validateProvenanceGraph({
        ...g,
        sources: [makeSource('src-1', { updatedOn: '2026/11/25' })]
      })
    ).toThrow('Invalid source date');

    // Usage status restricted without evidence, or whitespace evidence on unchecked
    expect(() =>
      validateProvenanceGraph({
        ...g,
        sources: [makeSource('src-1', { usage: { status: 'restricted', evidence: null } })]
      })
    ).toThrow('Usage evidence required');
    expect(() =>
      validateProvenanceGraph({
        ...g,
        sources: [makeSource('src-1', { usage: { status: 'unchecked', evidence: '   ' } })]
      })
    ).toThrow('Invalid usage evidence');

    // Missing source metadata (blank publisher / summary)
    expect(() =>
      validateProvenanceGraph({
        ...g,
        sources: [makeSource('src-1', { publisher: '   ' })]
      })
    ).toThrow('Missing source metadata');

    // Activity provenance does NOT satisfy missing Actor field provenance (e.g. missing only kind)
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actorAssertions: g.actorAssertions.filter((a) => a.target.field !== 'kind')
      })
    ).toThrow('Public actor requires field provenance');
  });
});
