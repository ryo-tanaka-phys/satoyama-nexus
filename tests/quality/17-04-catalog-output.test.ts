import { describe, expect, it } from 'vitest';
import type { Actor } from '../../packages/domain/src/m1';
import {
  exportPublicCatalog,
  exportSimulationCase,
  validateProvenanceGraph,
  type SourceDocument
} from '../../packages/domain/src/provenance';
import {
  exportCatalogWithActors,
  validateActorProvenanceGraph,
  type ActorProvenanceGraph
} from '../../packages/domain/src/actor-provenance';

const SENTINELS = [
  'SENTINEL_SIM_PERSON_NAME',
  'SENTINEL_SIM_ORG_NAME',
  'SENTINEL_SIM_EXPERTISE',
  'SENTINEL_SIM_ACTIVITY_TITLE',
  'SENTINEL_SIM_MEMBERSHIP_EVIDENCE',
  'SENTINEL_PUB_MEMBERSHIP_EVIDENCE',
  'SENTINEL_SIM_PARTY_ROLE',
  'SENTINEL_PUB_PARTY_ROLE',
  'SENTINEL_CASE_ID',
  'SENTINEL_CASE_PARTY_ROLE',
  'SENTINEL_ACTIVITY_NEED',
  'SENTINEL_CASE_NEED',
  'SENTINEL_STRIPPED_PARTY_EXTRA'
] as const;

const collectStringsAndKeys = (value: unknown, keys: string[] = [], strings: string[] = []): { keys: string[]; strings: string[] } => {
  if (typeof value === 'string') {
    strings.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStringsAndKeys(item, keys, strings);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.push(k);
      collectStringsAndKeys(v, keys, strings);
    }
  }
  return { keys, strings };
};

const makeMixedGraph = (): ActorProvenanceGraph => {
  const pubPerson: Actor = {
    id: 'pub-person-1',
    domain: 'public-catalog',
    kind: 'person',
    displayName: '公開個人テスト',
    expertise: [{ label: '植物分類', evidence: '公開名簿記載' }]
  };
  const pubOrg: Actor = {
    id: 'pub-org-1',
    domain: 'public-catalog',
    kind: 'organization',
    displayName: '公開団体テスト',
    expertise: []
  };
  const simPerson: Actor = {
    id: 'sim-person-1',
    domain: 'simulation',
    kind: 'person',
    displayName: 'SENTINEL_SIM_PERSON_NAME',
    expertise: [{ label: 'SENTINEL_SIM_EXPERTISE', evidence: null }]
  };
  const simOrg: Actor = {
    id: 'sim-org-1',
    domain: 'simulation',
    kind: 'organization',
    displayName: 'SENTINEL_SIM_ORG_NAME',
    expertise: []
  };
  const src: SourceDocument = {
    id: 'src-pub-1',
    url: 'https://example.invalid/catalog-test',
    publisher: '架空公開発行者',
    title: '公開資料テスト',
    accessedOn: '2026-11-25',
    publishedOn: null,
    updatedOn: null,
    summary: '公開情報の要約テスト',
    urlStatus: 'unchecked',
    usage: { status: 'unchecked', evidence: null }
  };
  const actorAssertions = [pubPerson, pubOrg].flatMap((a) =>
    (['displayName', 'kind', 'expertise'] as const).map((field) => ({
      id: `aa-${a.id}-${field}`,
      target: { actorId: a.id, revision: 1, field },
      sourceId: src.id,
      value: field === 'expertise' ? JSON.stringify(a.expertise) : a[field],
      status: 'unverified' as const,
      checkedBy: null,
      checkedAt: null
    }))
  );

  return {
    actors: [pubPerson, pubOrg, simPerson, simOrg],
    actorRevisions: [
      { actor: pubPerson, revision: 1 },
      { actor: pubOrg, revision: 1 },
      { actor: simPerson, revision: 1 },
      { actor: simOrg, revision: 1 }
    ],
    actorAssertions,
    memberships: [
      { personId: pubPerson.id, organizationId: pubOrg.id, evidence: 'SENTINEL_PUB_MEMBERSHIP_EVIDENCE' },
      { personId: simPerson.id, organizationId: simOrg.id, evidence: 'SENTINEL_SIM_MEMBERSHIP_EVIDENCE' }
    ],
    activities: [
      { id: 'act-pub-1', domain: 'public-catalog', revision: 1, title: '公開テスト活動' },
      { id: 'act-sim-1', domain: 'simulation', revision: 1, title: 'SENTINEL_SIM_ACTIVITY_TITLE' }
    ],
    activityRevisions: [
      { id: 'act-pub-1', domain: 'public-catalog', revision: 1, title: '公開テスト活動' },
      { id: 'act-sim-1', domain: 'simulation', revision: 1, title: 'SENTINEL_SIM_ACTIVITY_TITLE' }
    ],
    activityParties: [
      { activityId: 'act-pub-1', actorId: pubOrg.id, role: 'SENTINEL_PUB_PARTY_ROLE' },
      { activityId: 'act-sim-1', actorId: simPerson.id, role: 'SENTINEL_SIM_PARTY_ROLE' }
    ],
    cases: [
      {
        mode: 'simulation',
        id: 'SENTINEL_CASE_ID',
        activity: { id: 'act-pub-1', domain: 'public-catalog', revision: 1 },
        revision: 1,
        stage: 'draft',
        parties: [{ actorId: simPerson.id, role: 'SENTINEL_CASE_PARTY_ROLE' }]
      }
    ],
    interests: [{ mode: 'simulation', caseId: 'SENTINEL_CASE_ID', actorId: simPerson.id, kind: 'interest' }],
    needs: [
      { id: 'need-act', owner: { kind: 'activity', id: 'act-pub-1', revision: 1 }, description: 'SENTINEL_ACTIVITY_NEED' },
      { id: 'need-case', owner: { kind: 'case', id: 'SENTINEL_CASE_ID', revision: 1 }, description: 'SENTINEL_CASE_NEED' }
    ],
    sources: [src],
    assertions: [
      {
        id: 'asrt-pub-title',
        target: { activityId: 'act-pub-1', revision: 1, field: 'title' },
        sourceId: src.id,
        value: '公開テスト活動',
        status: 'unverified',
        checkedBy: null,
        checkedAt: null
      }
    ]
  };
};

describe('17-04 Catalog and simulation export allowlists and leakage prevention', () => {
  it('enforces exact allowlisted keys and leaks zero simulation/membership/case/interest/need sentinels recursively', () => {
    const g = makeMixedGraph();
    expect(() => validateActorProvenanceGraph(g)).not.toThrow();

    const pubCatalog = exportPublicCatalog(g);
    expect(Object.keys(pubCatalog).sort()).toEqual(['activities', 'assertions', 'kind', 'notice', 'sources']);
    expect(pubCatalog.kind).toBe('public-catalog');
    expect(pubCatalog.notice).toBe('公開情報は募集継続・連絡許可・参加・合意を意味しない。');
    expect(pubCatalog.activities).toHaveLength(1);
    expect(Object.keys(pubCatalog.activities[0]).sort()).toEqual(['domain', 'id', 'revision', 'title']);

    const pubScanned = collectStringsAndKeys(pubCatalog);
    for (const forbiddenKey of ['actors', 'actorRevisions', 'actorAssertions', 'memberships', 'activityParties', 'cases', 'interests', 'needs', 'parties', 'accounts', 'permissions']) {
      expect(pubScanned.keys).not.toContain(forbiddenKey);
    }
    for (const sentinel of SENTINELS) {
      expect(pubScanned.strings.some((s) => s.includes(sentinel))).toBe(false);
    }

    const withActors = exportCatalogWithActors(g);
    expect(Object.keys(withActors).sort()).toEqual([
      'activities',
      'actorAssertions',
      'actors',
      'assertions',
      'kind',
      'notice',
      'sources'
    ]);
    expect(withActors.actors).toHaveLength(2);
    for (const entry of withActors.actors) {
      expect(Object.keys(entry).sort()).toEqual(['actor', 'revision']);
      expect(Object.keys(entry.actor).sort()).toEqual(['displayName', 'domain', 'expertise', 'id', 'kind']);
      expect(entry.actor.domain).toBe('public-catalog');
      for (const exp of entry.actor.expertise) {
        expect(Object.keys(exp).sort()).toEqual(['evidence', 'label']);
      }
    }

    const actorScanned = collectStringsAndKeys(withActors);
    for (const forbiddenKey of ['memberships', 'activityParties', 'cases', 'interests', 'needs', 'parties', 'accounts', 'permissions']) {
      expect(actorScanned.keys).not.toContain(forbiddenKey);
    }
    for (const sentinel of SENTINELS) {
      expect(actorScanned.strings.some((s) => s.includes(sentinel))).toBe(false);
    }
  });

  it('keeps exportSimulationCase allowlisted, fixes simulation notice, and rejects unknown case IDs', () => {
    const g = makeMixedGraph();
    const exported = exportSimulationCase(g, 'SENTINEL_CASE_ID');

    expect(Object.keys(exported).sort()).toEqual(['case', 'mode', 'notice']);
    expect(exported.mode).toBe('simulation');
    expect(exported.notice).toBe('模擬検討。実在主体の参加・応答・合意を示さない。');
    expect(Object.keys(exported.case).sort()).toEqual(['activity', 'id', 'mode', 'parties', 'revision', 'stage']);
    expect(Object.keys(exported.case.activity).sort()).toEqual(['domain', 'id', 'revision']);
    expect(Object.keys(exported.case.parties[0]).sort()).toEqual(['actorId', 'role']);
    expect(exported.case).not.toHaveProperty('review');
    expect(exported.case).not.toHaveProperty('consent');

    expect(() => exportSimulationCase(g, 'nonexistent-case')).toThrow('Unknown case');
  });

  it('distinguishes unknown-field input rejection from allowlist output stripping', () => {
    const g = makeMixedGraph();

    // 1) Unknown fields rejected at validation/export input boundary
    expect(() =>
      exportPublicCatalog({
        ...g,
        sources: [{ ...g.sources[0], internalNote: 'unexpected' } as unknown as SourceDocument]
      })
    ).toThrow('Unexpected provenance field');

    expect(() =>
      exportPublicCatalog({
        ...g,
        sources: [{ ...g.sources[0], usage: { ...g.sources[0].usage, approvedBy: 'none' } as unknown as SourceDocument['usage'] }]
      })
    ).toThrow('Unexpected provenance field');

    expect(() =>
      exportPublicCatalog({
        ...g,
        assertions: [{ ...g.assertions[0], consent: true } as unknown as (typeof g.assertions)[number]]
      })
    ).toThrow('Unexpected provenance field');

    expect(() =>
      exportSimulationCase(
        {
          ...g,
          cases: [{ ...g.cases[0], review: { decision: 'approved' } } as unknown as (typeof g.cases)[number]]
        },
        'SENTINEL_CASE_ID'
      )
    ).toThrow('Unexpected provenance field');

    expect(() =>
      exportCatalogWithActors({
        ...g,
        actorRevisions: [
          { ...g.actorRevisions[0], accounts: ['u1'] } as unknown as (typeof g.actorRevisions)[number],
          ...g.actorRevisions.slice(1)
        ]
      })
    ).toThrow('Unexpected actor provenance field');

    expect(() =>
      exportCatalogWithActors({
        ...g,
        actorRevisions: [
          {
            ...g.actorRevisions[0],
            actor: {
              ...g.actorRevisions[0].actor,
              expertise: [{ label: '植物分類', evidence: '公開名簿記載', verifiedLicense: true }]
            } as unknown as Actor
          },
          ...g.actorRevisions.slice(1)
        ]
      })
    ).toThrow('Unexpected actor provenance field');

    expect(() =>
      exportCatalogWithActors({
        ...g,
        actorAssertions: [
          { ...g.actorAssertions[0], extraPrivilege: 'admin' } as unknown as (typeof g.actorAssertions)[number],
          ...g.actorAssertions.slice(1)
        ]
      })
    ).toThrow('Unexpected actor provenance field');

    // 2) Output allowlist stripping (distinct from input rejection):
    // Extra property on CaseParty is not checked by validateProvenanceGraph's keys(),
    // yet exportSimulationCase reconstructs only { actorId, role }, stripping the extra property.
    const graphWithExtraPartyProp: ActorProvenanceGraph = {
      ...g,
      cases: [
        {
          ...g.cases[0],
          parties: [
            {
              actorId: 'sim-person-1',
              role: 'SENTINEL_CASE_PARTY_ROLE',
              secretNote: 'SENTINEL_STRIPPED_PARTY_EXTRA'
            } as unknown as (typeof g.cases)[number]['parties'][number]
          ]
        }
      ]
    };
    expect(() => validateProvenanceGraph(graphWithExtraPartyProp)).not.toThrow();
    const strippedExport = exportSimulationCase(graphWithExtraPartyProp, 'SENTINEL_CASE_ID');
    expect(Object.keys(strippedExport.case.parties[0]).sort()).toEqual(['actorId', 'role']);
    expect(JSON.stringify(strippedExport)).not.toContain('SENTINEL_STRIPPED_PARTY_EXTRA');
  });

  it('prevents deep mutation of exported objects from mutating the source graph', () => {
    const g = makeMixedGraph();
    const snapshot = structuredClone(g);

    const pubCatalog = exportPublicCatalog(g);
    (pubCatalog.activities[0] as { title: string }).title = 'MUTATED_ACT';
    (pubCatalog.sources[0].usage as { status: string }).status = 'permitted';
    (pubCatalog.assertions[0].target as { field: string }).field = 'summary';

    const withActors = exportCatalogWithActors(g);
    (withActors.actors[0].actor.expertise[0] as { label: string }).label = 'MUTATED_EXP';
    (withActors.actorAssertions[0].target as { field: string }).field = 'kind';

    const simExport = exportSimulationCase(g, 'SENTINEL_CASE_ID');
    (simExport.case.activity as { revision: number }).revision = 999;
    (simExport.case.parties[0] as { role: string }).role = 'MUTATED_ROLE';

    expect(g).toEqual(snapshot);
  });
});
