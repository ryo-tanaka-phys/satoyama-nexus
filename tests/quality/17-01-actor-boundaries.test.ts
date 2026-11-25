import { describe, expect, it } from 'vitest';
import {
  createCollaborationDraft,
  migrateM0Draft,
  validateDomainGraph,
  type Actor,
  type DomainGraph
} from '../../packages/domain/src/m1';
import type { SimulationCase } from '../../packages/domain/src';

const makeGraph = (): DomainGraph => ({
  actors: [
    { id: 'sim-person', domain: 'simulation', kind: 'person', displayName: '架空個人', expertise: [] },
    { id: 'sim-org', domain: 'simulation', kind: 'organization', displayName: '架空団体', expertise: [] },
    { id: 'sim-gov', domain: 'simulation', kind: 'government-body', displayName: '架空行政', expertise: [] },
    { id: 'pub-person', domain: 'public-catalog', kind: 'person', displayName: '公開個人テスト', expertise: [] },
    { id: 'pub-org', domain: 'public-catalog', kind: 'organization', displayName: '公開団体テスト', expertise: [] },
    { id: 'pub-gov', domain: 'public-catalog', kind: 'government-body', displayName: '公開行政テスト', expertise: [] }
  ],
  memberships: [
    { personId: 'sim-person', organizationId: 'sim-org', evidence: null },
    { personId: 'sim-person', organizationId: 'sim-gov', evidence: null },
    { personId: 'pub-person', organizationId: 'pub-org', evidence: '公開記述のみ（権限なし）' }
  ],
  activities: [
    { id: 'act-sim', domain: 'simulation', revision: 1, title: '架空活動' },
    { id: 'act-pub', domain: 'public-catalog', revision: 1, title: '公開活動テスト' }
  ],
  activityParties: [
    { activityId: 'act-sim', actorId: 'sim-person', role: 'proposer' },
    { activityId: 'act-pub', actorId: 'pub-org', role: 'organizer' }
  ],
  cases: [
    {
      mode: 'simulation',
      id: 'case-1',
      activity: { id: 'act-pub', domain: 'public-catalog', revision: 1 },
      revision: 1,
      stage: 'draft',
      parties: [{ actorId: 'sim-person', role: 'candidate' }]
    }
  ],
  interests: [{ mode: 'simulation', caseId: 'case-1', actorId: 'sim-person', kind: 'interest' }],
  needs: []
});

describe('17-01 ParticipationInterest and ActivityParty domain/reference boundaries', () => {
  it('accepts same-domain public and simulation ActivityParties and simulation ParticipationInterest as positive control', () => {
    const g = makeGraph();
    expect(() => validateDomainGraph(g)).not.toThrow();
  });

  it('rejects public actors, missing actors/cases, wrong mode/kind, and duplicates in ParticipationInterest', () => {
    const g = makeGraph();

    // Public actor in ParticipationInterest
    expect(() =>
      validateDomainGraph({
        ...g,
        interests: [{ mode: 'simulation', caseId: 'case-1', actorId: 'pub-person', kind: 'interest' }]
      })
    ).toThrow('Invalid interest');

    // Missing actor in ParticipationInterest
    expect(() =>
      validateDomainGraph({
        ...g,
        interests: [{ mode: 'simulation', caseId: 'case-1', actorId: 'missing-actor', kind: 'interest' }]
      })
    ).toThrow('Invalid interest');

    // Missing caseId in ParticipationInterest
    expect(() =>
      validateDomainGraph({
        ...g,
        interests: [{ mode: 'simulation', caseId: 'missing-case', actorId: 'sim-person', kind: 'interest' }]
      })
    ).toThrow('Invalid interest');

    // Invalid mode / kind on ParticipationInterest
    expect(() =>
      validateDomainGraph({
        ...g,
        interests: [
          { mode: 'public' as unknown as 'simulation', caseId: 'case-1', actorId: 'sim-person', kind: 'interest' }
        ]
      })
    ).toThrow('Invalid interest');
    expect(() =>
      validateDomainGraph({
        ...g,
        interests: [
          { mode: 'simulation', caseId: 'case-1', actorId: 'sim-person', kind: 'approved' as unknown as 'interest' }
        ]
      })
    ).toThrow('Invalid interest');

    // Duplicate ParticipationInterest [caseId, actorId]
    expect(() =>
      validateDomainGraph({
        ...g,
        interests: [g.interests[0], g.interests[0]]
      })
    ).toThrow('Duplicate interest');
  });

  it('rejects cross-domain, missing-reference, blank-role, and duplicate ActivityParties', () => {
    const g = makeGraph();

    // Public activity paired with simulation actor
    expect(() =>
      validateDomainGraph({
        ...g,
        activityParties: [{ activityId: 'act-pub', actorId: 'sim-person', role: 'organizer' }]
      })
    ).toThrow('Invalid activity party');

    // Simulation activity paired with public actor
    expect(() =>
      validateDomainGraph({
        ...g,
        activityParties: [{ activityId: 'act-sim', actorId: 'pub-org', role: 'organizer' }]
      })
    ).toThrow('Invalid activity party');

    // Missing activity or missing actor
    expect(() =>
      validateDomainGraph({
        ...g,
        activityParties: [{ activityId: 'missing-act', actorId: 'sim-person', role: 'proposer' }]
      })
    ).toThrow('Invalid activity party');
    expect(() =>
      validateDomainGraph({
        ...g,
        activityParties: [{ activityId: 'act-sim', actorId: 'missing-actor', role: 'proposer' }]
      })
    ).toThrow('Invalid activity party');

    // Whitespace role
    expect(() =>
      validateDomainGraph({
        ...g,
        activityParties: [{ activityId: 'act-sim', actorId: 'sim-person', role: '   ' }]
      })
    ).toThrow('Invalid activity party');

    // Duplicate [activityId, actorId, role]
    expect(() =>
      validateDomainGraph({
        ...g,
        activityParties: [g.activityParties[0], g.activityParties[0]]
      })
    ).toThrow('Duplicate activity party');
  });
});

describe('17-01 Actor integrity, ActorMembership constraints, and non-delegation boundaries', () => {
  it('rejects invalid ActorMembership endpoints (non-person as personId, person as organizationId, missing, duplicate)', () => {
    const g = makeGraph();

    // Organization used as personId
    expect(() =>
      validateDomainGraph({
        ...g,
        memberships: [{ personId: 'sim-org', organizationId: 'sim-gov', evidence: null }]
      })
    ).toThrow('Invalid membership');

    // Government-body used as personId
    expect(() =>
      validateDomainGraph({
        ...g,
        memberships: [{ personId: 'pub-gov', organizationId: 'pub-org', evidence: null }]
      })
    ).toThrow('Invalid membership');

    // Person used as organizationId
    expect(() =>
      validateDomainGraph({
        ...g,
        memberships: [{ personId: 'sim-person', organizationId: 'sim-person', evidence: null }]
      })
    ).toThrow('Invalid membership');

    // Missing endpoint
    expect(() =>
      validateDomainGraph({
        ...g,
        memberships: [{ personId: 'sim-person', organizationId: 'missing-org', evidence: null }]
      })
    ).toThrow('Invalid membership');

    // Duplicate membership
    expect(() =>
      validateDomainGraph({
        ...g,
        memberships: [g.memberships[0], g.memberships[0]]
      })
    ).toThrow('Duplicate membership');
  });

  it('rejects blank actor id/displayName, invalid actor domain/kind, and reference domain swap', () => {
    const g = makeGraph();

    expect(() =>
      validateDomainGraph({
        ...g,
        actors: [...g.actors, { id: '   ', domain: 'simulation', kind: 'person', displayName: '空白ID', expertise: [] }]
      })
    ).toThrow('Empty actor');

    expect(() =>
      validateDomainGraph({
        ...g,
        actors: [...g.actors, { id: 'blank-name', domain: 'simulation', kind: 'person', displayName: '   ', expertise: [] }]
      })
    ).toThrow('Empty display name');

    expect(() =>
      validateDomainGraph({
        ...g,
        actors: [
          ...g.actors,
          { id: 'bad-domain', domain: 'external' as unknown as Actor['domain'], kind: 'person', displayName: '不正領域', expertise: [] }
        ]
      })
    ).toThrow('Invalid actor domain');

    expect(() =>
      validateDomainGraph({
        ...g,
        actors: [
          ...g.actors,
          { id: 'bad-kind', domain: 'simulation', kind: 'expert' as unknown as Actor['kind'], displayName: '不正種別', expertise: [] }
        ]
      })
    ).toThrow('Invalid actor kind');

    // Swapping a referenced simulation actor to public-catalog must invalidate CaseParty
    expect(() =>
      validateDomainGraph({
        ...g,
        memberships: [],
        activityParties: [],
        interests: [],
        actors: g.actors.map((a) => (a.id === 'sim-person' ? { ...a, domain: 'public-catalog' as const } : a))
      })
    ).toThrow('Simulation actors only');

    // Blank CaseParty role or missing CaseParty actor
    expect(() =>
      validateDomainGraph({
        ...g,
        cases: [{ ...g.cases[0], parties: [{ actorId: 'sim-person', role: '   ' }] }]
      })
    ).toThrow('Simulation actors only');
    expect(() =>
      validateDomainGraph({
        ...g,
        cases: [{ ...g.cases[0], parties: [{ actorId: 'missing-actor', role: 'candidate' }] }]
      })
    ).toThrow('Simulation actors only');
  });

  it('confirms descriptive public membership grants no draft participation and validates createCollaborationDraft / migrateM0Draft negatives', () => {
    const g = makeGraph();
    const pubAct = { id: 'act-pub', domain: 'public-catalog' as const, revision: 1 };

    // Positive control: simulation actor can form a draft against a public activity
    const validDraft = createCollaborationDraft(g, 'case-2', pubAct, [{ actorId: 'sim-org', role: 'candidate' }]);
    expect(validDraft.mode).toBe('simulation');
    expect(validDraft.stage).toBe('draft');

    // Public person with descriptive public ActorMembership still cannot join a simulation CaseParty
    expect(() =>
      createCollaborationDraft(g, 'case-pub-person', pubAct, [{ actorId: 'pub-person', role: 'candidate' }])
    ).toThrow('Simulation actors only');
    expect(() =>
      createCollaborationDraft(g, 'case-pub-org', pubAct, [{ actorId: 'pub-org', role: 'candidate' }])
    ).toThrow('Simulation actors only');

    // Missing actor, blank role, and duplicate case ID rejected by createCollaborationDraft
    expect(() =>
      createCollaborationDraft(g, 'case-missing', pubAct, [{ actorId: 'absent', role: 'candidate' }])
    ).toThrow('Simulation actors only');
    expect(() =>
      createCollaborationDraft(g, 'case-blank-role', pubAct, [{ actorId: 'sim-person', role: '  ' }])
    ).toThrow('Simulation actors only');
    expect(() =>
      createCollaborationDraft(g, 'case-1', pubAct, [{ actorId: 'sim-person', role: 'candidate' }])
    ).toThrow('Duplicate case');

    // migrateM0Draft: rejects blank profileId and public actor mapping
    const legacyDraft: SimulationCase = {
      mode: 'simulation',
      id: 'legacy-2',
      activityId: 'act-pub',
      profileId: 'sim-profile-01',
      stage: 'draft'
    };
    expect(() =>
      migrateM0Draft(g, { ...legacyDraft, profileId: '   ' }, { activity: pubAct, actorId: 'sim-person', role: 'candidate' })
    ).toThrow('Missing M0 profile');
    expect(() =>
      migrateM0Draft(g, legacyDraft, { activity: pubAct, actorId: 'pub-person', role: 'candidate' })
    ).toThrow('Simulation actors only');
  });
});
