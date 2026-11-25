import { describe, expect, it } from 'vitest';
import type { Actor, Activity } from '../../packages/domain/src/m1';
import {
  appendActivityRevision,
  validateProvenanceGraph,
  type ProvenanceGraph,
  type SourceAssertion,
  type SourceDocument
} from '../../packages/domain/src/provenance';
import {
  appendActorRevision,
  validateActorProvenanceGraph,
  type ActorProvenanceGraph,
  type ActorSourceAssertion
} from '../../packages/domain/src/actor-provenance';

const makeSource = (id: string, title = 'テスト資料'): SourceDocument => ({
  id,
  url: `https://example.invalid/sources/${id}`,
  publisher: '架空テスト発行者',
  title,
  accessedOn: '2026-11-25',
  publishedOn: null,
  updatedOn: null,
  summary: `テスト専用出典 ${id}`,
  urlStatus: 'unchecked',
  usage: { status: 'unchecked', evidence: null }
});

const makeActivityAssertion = (
  id: string,
  activityId: string,
  revision: number,
  value: string,
  sourceId: string
): SourceAssertion => ({
  id,
  target: { activityId, revision, field: 'title' },
  sourceId,
  value,
  status: 'unverified',
  checkedBy: null,
  checkedAt: null
});

const makeActorAssertions = (
  actor: Actor,
  revision: number,
  sourceId: string,
  prefix = 'aa'
): ActorSourceAssertion[] =>
  (['displayName', 'kind', 'expertise'] as const).map((field) => ({
    id: `${prefix}-${actor.id}-${revision}-${field}`,
    target: { actorId: actor.id, revision, field },
    sourceId,
    value: field === 'expertise' ? JSON.stringify(actor.expertise) : actor[field],
    status: 'unverified',
    checkedBy: null,
    checkedAt: null
  }));

const makeActivityGraph = (): ProvenanceGraph => ({
  actors: [
    { id: 'sim-p1', domain: 'simulation', kind: 'person', displayName: '架空参加者1', expertise: [] }
  ],
  memberships: [],
  activities: [{ id: 'act-1', domain: 'public-catalog', revision: 1, title: '公開テスト活動v1' }],
  activityRevisions: [{ id: 'act-1', domain: 'public-catalog', revision: 1, title: '公開テスト活動v1' }],
  activityParties: [],
  cases: [
    {
      mode: 'simulation',
      id: 'case-r1',
      activity: { id: 'act-1', domain: 'public-catalog', revision: 1 },
      revision: 1,
      stage: 'draft',
      parties: [{ actorId: 'sim-p1', role: 'candidate' }]
    }
  ],
  interests: [],
  needs: [
    {
      id: 'need-r1',
      owner: { kind: 'activity', id: 'act-1', revision: 1 },
      description: 'v1時点の必要資源（テスト）'
    }
  ],
  sources: [makeSource('src-1')],
  assertions: [makeActivityAssertion('asrt-1', 'act-1', 1, '公開テスト活動v1', 'src-1')]
});

const makeActorGraph = (): ActorProvenanceGraph => {
  const pubActor: Actor = {
    id: 'pub-org-1',
    domain: 'public-catalog',
    kind: 'organization',
    displayName: '架空公開団体v1',
    expertise: [{ label: '里山管理', evidence: '出典記載（未確認）' }]
  };
  const simActor: Actor = {
    id: 'sim-p1',
    domain: 'simulation',
    kind: 'person',
    displayName: '架空模擬個人v1',
    expertise: []
  };
  const base = makeActivityGraph();
  return {
    ...base,
    actors: [pubActor, simActor],
    actorRevisions: [
      { actor: pubActor, revision: 1 },
      { actor: simActor, revision: 1 }
    ],
    actorAssertions: makeActorAssertions(pubActor, 1, 'src-1')
  };
};

describe('17-03 Activity revision pinning and deep immutability', () => {
  it('keeps Case and activity-owned Need pinned to rev 1 and rev 2 when advancing activity 2 -> 3', () => {
    const rev1 = makeActivityGraph();
    const rev2Base = appendActivityRevision(
      rev1,
      { id: 'act-1', domain: 'public-catalog', revision: 2, title: '公開テスト活動v2' },
      [makeSource('src-2')],
      [makeActivityAssertion('asrt-2', 'act-1', 2, '公開テスト活動v2', 'src-2')]
    );
    const rev2WithRefs: ProvenanceGraph = {
      ...rev2Base,
      cases: [
        ...rev2Base.cases,
        {
          mode: 'simulation',
          id: 'case-r2',
          activity: { id: 'act-1', domain: 'public-catalog', revision: 2 },
          revision: 1,
          stage: 'draft',
          parties: [{ actorId: 'sim-p1', role: 'candidate' }]
        }
      ],
      needs: [
        ...rev2Base.needs,
        {
          id: 'need-r2',
          owner: { kind: 'activity', id: 'act-1', revision: 2 },
          description: 'v2時点の必要資源（テスト）'
        }
      ]
    };

    const rev3 = appendActivityRevision(
      rev2WithRefs,
      { id: 'act-1', domain: 'public-catalog', revision: 3, title: '公開テスト活動v3' },
      [makeSource('src-3')],
      [makeActivityAssertion('asrt-3', 'act-1', 3, '公開テスト活動v3', 'src-3')]
    );

    expect(() => validateProvenanceGraph(rev3)).not.toThrow();
    expect(rev3.activities).toEqual([
      { id: 'act-1', domain: 'public-catalog', revision: 3, title: '公開テスト活動v3' }
    ]);
    expect(rev3.activityRevisions.map((r) => [r.revision, r.title])).toEqual([
      [1, '公開テスト活動v1'],
      [2, '公開テスト活動v2'],
      [3, '公開テスト活動v3']
    ]);
    expect(rev3.cases.map((c) => [c.id, c.activity.revision])).toEqual([
      ['case-r1', 1],
      ['case-r2', 2]
    ]);
    expect(rev3.needs.map((n) => [n.id, n.owner.kind, n.owner.revision])).toEqual([
      ['need-r1', 'activity', 1],
      ['need-r2', 'activity', 2]
    ]);
    expect(rev3.assertions.map((a) => [a.id, a.target.revision, a.value])).toEqual([
      ['asrt-1', 1, '公開テスト活動v1'],
      ['asrt-2', 2, '公開テスト活動v2'],
      ['asrt-3', 3, '公開テスト活動v3']
    ]);
  });

  it('isolates input graph, appended payloads, and returned graph against deep mutation', () => {
    const original = makeActivityGraph();
    const originalSnapshot = structuredClone(original);

    const nextRevInput: Activity = {
      id: 'act-1',
      domain: 'public-catalog',
      revision: 2,
      title: '公開テスト活動v2'
    };
    const nextSourceInput = makeSource('src-2');
    const nextAssertionInput = makeActivityAssertion('asrt-2', 'act-1', 2, '公開テスト活動v2', 'src-2');

    const result = appendActivityRevision(original, nextRevInput, [nextSourceInput], [nextAssertionInput]);
    const resultSnapshot = structuredClone(result);

    // Mutate caller-owned inputs after appendActivityRevision
    nextRevInput.title = 'MUTATED_INPUT_TITLE';
    nextSourceInput.usage.status = 'restricted';
    nextSourceInput.usage.evidence = 'MUTATED_USAGE';
    nextAssertionInput.target.field = 'summary';
    nextAssertionInput.value = 'MUTATED_ASSERTION';

    expect(result).toEqual(resultSnapshot);
    expect(original).toEqual(originalSnapshot);

    // Mutate returned graph deeply and ensure input graph remains intact
    (result.activityRevisions[0] as { title: string }).title = 'MUTATED_HISTORY';
    (result.cases[0].activity as { revision: number }).revision = 99;
    (result.needs[0].owner as { revision: number }).revision = 99;
    (result.assertions[0].target as { revision: number }).revision = 99;
    (result.sources[0].usage as { status: string }).status = 'permitted';

    expect(original).toEqual(originalSnapshot);
  });

  it('rejects uncovered activity head mismatches, future/orphan/duplicate revisions, and records gap asymmetry', () => {
    const rev1 = makeActivityGraph();
    const rev2 = appendActivityRevision(
      rev1,
      { id: 'act-1', domain: 'public-catalog', revision: 2, title: '公開テスト活動v2' },
      [makeSource('src-2')],
      [makeActivityAssertion('asrt-2', 'act-1', 2, '公開テスト活動v2', 'src-2')]
    );

    // Head title differs from recorded head snapshot
    expect(() =>
      validateProvenanceGraph({
        ...rev2,
        activities: [{ ...rev2.activities[0], title: '未記録タイトル変更' }]
      })
    ).toThrow('Missing current activity revision');

    // Head revision missing from activityRevisions
    expect(() =>
      validateProvenanceGraph({
        ...rev2,
        activityRevisions: [rev2.activityRevisions[0]]
      })
    ).toThrow('Missing current activity revision');

    // Historical revision exceeds head revision
    expect(() =>
      validateProvenanceGraph({
        ...rev1,
        activityRevisions: [
          ...rev1.activityRevisions,
          { id: 'act-1', domain: 'public-catalog', revision: 2, title: '未来版' }
        ]
      })
    ).toThrow('Invalid activity history');

    // Orphan activity revision whose id is not in activities
    expect(() =>
      validateProvenanceGraph({
        ...rev1,
        activityRevisions: [
          ...rev1.activityRevisions,
          { id: 'orphan-act', domain: 'simulation', revision: 1, title: '孤立活動' }
        ]
      })
    ).toThrow('Invalid activity history');

    // Duplicate activity revision
    expect(() =>
      validateProvenanceGraph({
        ...rev1,
        activityRevisions: [rev1.activityRevisions[0], rev1.activityRevisions[0]]
      })
    ).toThrow('Duplicate activity revision');

    // Activity-owned Need pointing to non-existent revision
    expect(() =>
      validateProvenanceGraph({
        ...rev2,
        needs: [{ id: 'need-bad', owner: { kind: 'activity', id: 'act-1', revision: 99 }, description: '不正版' }]
      })
    ).toThrow('Invalid need owner');

    // Documented asymmetry (see docs/quality/17-03-revision-pinning.md):
    // Unlike validateActorProvenanceGraph (which enforces contiguous 1..N history),
    // validateDomainGraph/validateProvenanceGraph currently allows externally constructed
    // activityRevisions with a missing intermediate revision [1, 3] when rev 3 matches head.
    const gappedActivityGraph: ProvenanceGraph = {
      ...rev1,
      activities: [{ id: 'act-1', domain: 'public-catalog', revision: 3, title: '公開テスト活動v3' }],
      activityRevisions: [
        rev1.activityRevisions[0],
        { id: 'act-1', domain: 'public-catalog', revision: 3, title: '公開テスト活動v3' }
      ],
      sources: [...rev1.sources, makeSource('src-3')],
      assertions: [
        ...rev1.assertions,
        makeActivityAssertion('asrt-3', 'act-1', 3, '公開テスト活動v3', 'src-3')
      ]
    };
    expect(() => validateProvenanceGraph(gappedActivityGraph)).not.toThrow();
  });
});

describe('17-03 Actor revision history retention, deep immutability, and uncovered rejections', () => {
  it('retains actor history across 2 -> 3 while keeping CaseParty distinct from activity revision pinning', () => {
    const rev1 = makeActorGraph();
    const pubV2: Actor = {
      ...rev1.actors[0],
      displayName: '架空公開団体v2',
      expertise: [{ label: '里山管理', evidence: '出典記載v2' }]
    };
    const rev2 = appendActorRevision(
      rev1,
      { actor: pubV2, revision: 2 },
      makeActorAssertions(pubV2, 2, 'src-1', 'aa2')
    );

    const pubV3: Actor = {
      ...pubV2,
      displayName: '架空公開団体v3',
      expertise: [
        { label: '里山管理', evidence: '出典記載v2' },
        { label: '植生調査', evidence: null }
      ]
    };
    const rev3 = appendActorRevision(
      rev2,
      { actor: pubV3, revision: 3 },
      makeActorAssertions(pubV3, 3, 'src-1', 'aa3')
    );

    // Advance simulated actor referenced by CaseParty (CaseParty pins actorId only, not actor revision)
    const simV2: Actor = {
      ...rev3.actors.find((a) => a.id === 'sim-p1')!,
      displayName: '架空模擬個人v2'
    };
    const withSimV2 = appendActorRevision(rev3, { actor: simV2, revision: 2 }, []);

    expect(() => validateActorProvenanceGraph(withSimV2)).not.toThrow();
    expect(
      withSimV2.actorRevisions
        .filter((r) => r.actor.id === 'pub-org-1')
        .map((r) => [r.revision, r.actor.displayName, r.actor.expertise.length])
    ).toEqual([
      [1, '架空公開団体v1', 1],
      [2, '架空公開団体v2', 1],
      [3, '架空公開団体v3', 2]
    ]);
    expect(
      withSimV2.actorRevisions
        .filter((r) => r.actor.id === 'sim-p1')
        .map((r) => [r.revision, r.actor.displayName])
    ).toEqual([
      [1, '架空模擬個人v1'],
      [2, '架空模擬個人v2']
    ]);
    // CaseParty remains bound by actorId without introducing an unapproved actorRevision field
    expect(withSimV2.cases[0].parties[0]).toEqual({ actorId: 'sim-p1', role: 'candidate' });
    expect(withSimV2.cases[0].parties[0]).not.toHaveProperty('actorRevision');
    expect(withSimV2.actorAssertions).toHaveLength(9);
  });

  it('isolates actor input graph, expertise arrays, assertions, and returned graph against deep mutation', () => {
    const original = makeActorGraph();
    const originalSnapshot = structuredClone(original);

    const updatedActor: Actor = {
      ...original.actors[0],
      displayName: '架空公開団体v2',
      expertise: [{ label: '竹林整備', evidence: '初期根拠' }]
    };
    const addedAssertions = makeActorAssertions(updatedActor, 2, 'src-1', 'aa2');

    const result = appendActorRevision(original, { actor: updatedActor, revision: 2 }, addedAssertions);
    const resultSnapshot = structuredClone(result);

    // Mutate caller-owned inputs deeply
    updatedActor.displayName = 'MUTATED_NAME';
    (updatedActor.expertise[0] as { label: string; evidence: string | null }).label = 'MUTATED_LABEL';
    (updatedActor.expertise[0] as { label: string; evidence: string | null }).evidence = 'MUTATED_EVIDENCE';
    addedAssertions[0].target.field = 'kind';
    addedAssertions[0].value = 'MUTATED_VALUE';

    expect(result).toEqual(resultSnapshot);
    expect(original).toEqual(originalSnapshot);

    // Mutate returned graph deeply and confirm original graph and past snapshots are isolated
    const pubHistory = result.actorRevisions.filter((r) => r.actor.id === 'pub-org-1');
    (pubHistory[0].actor.expertise[0] as { label: string }).label = 'MUTATED_PAST_EXPERTISE';
    (result.actorAssertions[0] as { value: string }).value = 'MUTATED_PAST_ASSERTION';

    expect(original).toEqual(originalSnapshot);
  });

  it('rejects actor version skips, kind changes, history gaps, duplicates, orphans, and expertise head mismatches', () => {
    const g = makeActorGraph();
    const pub = g.actors[0];
    const pubV2: Actor = { ...pub, displayName: '架空公開団体v2' };

    // appendActorRevision: version skip (1 -> 3)
    expect(() =>
      appendActorRevision(g, { actor: pubV2, revision: 3 }, makeActorAssertions(pubV2, 3, 'src-1', 'skip'))
    ).toThrow('Invalid next actor revision');

    // appendActorRevision: new actor starting at revision 2
    const brandNew: Actor = {
      id: 'sim-new',
      domain: 'simulation',
      kind: 'person',
      displayName: '新規架空個人',
      expertise: []
    };
    expect(() => appendActorRevision(g, { actor: brandNew, revision: 2 }, [])).toThrow(
      'Invalid next actor revision'
    );

    // appendActorRevision: kind change (organization -> government-body)
    const changedKind: Actor = { ...pub, kind: 'government-body' };
    expect(() =>
      appendActorRevision(
        g,
        { actor: changedKind, revision: 2 },
        makeActorAssertions(changedKind, 2, 'src-1', 'kind')
      )
    ).toThrow('Actor classification change requires review');

    // validateActorProvenanceGraph: history gap [1, 3] (missing revision 2)
    const pubV3: Actor = { ...pub, displayName: '架空公開団体v3' };
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actors: [pubV3, g.actors[1]],
        actorRevisions: [...g.actorRevisions, { actor: pubV3, revision: 3 }],
        actorAssertions: [...g.actorAssertions, ...makeActorAssertions(pubV3, 3, 'src-1', 'gap')]
      })
    ).toThrow('Missing actor history');

    // validateActorProvenanceGraph: history starting at [2] (missing revision 1)
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actors: [pubV2, g.actors[1]],
        actorRevisions: [{ actor: pubV2, revision: 2 }, g.actorRevisions[1]],
        actorAssertions: makeActorAssertions(pubV2, 2, 'src-1', 'start2')
      })
    ).toThrow('Missing actor history');

    // validateActorProvenanceGraph: duplicate actor revision
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actorRevisions: [...g.actorRevisions, g.actorRevisions[0]]
      })
    ).toThrow('Duplicate actor revision');

    // validateActorProvenanceGraph: orphan actor history
    const orphan: Actor = {
      id: 'orphan-actor',
      domain: 'simulation',
      kind: 'person',
      displayName: '孤立主体',
      expertise: []
    };
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actorRevisions: [...g.actorRevisions, { actor: orphan, revision: 1 }]
      })
    ).toThrow('Invalid actor history');

    // validateActorProvenanceGraph: historical revision has different kind than head
    const rev2Graph = appendActorRevision(
      g,
      { actor: pubV2, revision: 2 },
      makeActorAssertions(pubV2, 2, 'src-1', 'v2')
    );
    expect(() =>
      validateActorProvenanceGraph({
        ...rev2Graph,
        actorRevisions: rev2Graph.actorRevisions.map((r) =>
          r.actor.id === 'pub-org-1' && r.revision === 1
            ? { ...r, actor: { ...r.actor, kind: 'government-body' } }
            : r
        )
      })
    ).toThrow('Invalid actor history');

    // validateActorProvenanceGraph: expertise head mismatch (displayName unchanged, expertise mutated)
    expect(() =>
      validateActorProvenanceGraph({
        ...g,
        actors: [{ ...pub, expertise: [{ label: '無版改変技能', evidence: null }] }, g.actors[1]]
      })
    ).toThrow('Actor head mismatch');
  });
});
