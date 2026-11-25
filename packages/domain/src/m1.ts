import type { CollaborationStage } from './index';

/** Descriptive actors never confer login or delegation privileges. */
export interface Actor {
  id: string;
  domain: 'public-catalog' | 'simulation';
  kind: 'person' | 'organization' | 'government-body';
  displayName: string;
  expertise: readonly { label: string; evidence: string | null }[];
}
export interface ActorMembership {
  personId: string;
  organizationId: string;
  evidence: string | null;
  // Descriptive membership only; permission grants belong to the auth adapter.
}
export interface Activity {
  id: string;
  domain: Actor['domain'];
  revision: number;
  title: string;
}
export interface ActivityParty {
  activityId: string;
  actorId: string;
  role: string;
}
export interface CaseParty {
  actorId: string;
  role: string;
}
export interface CollaborationCase {
  mode: 'simulation';
  id: string;
  activity: { id: string; domain: Activity['domain']; revision: number };
  revision: number;
  stage: CollaborationStage;
  parties: readonly CaseParty[];
}
export interface ParticipationInterest {
  mode: 'simulation';
  caseId: string;
  actorId: string;
  // Interest is neither an invitation, approval nor agreement.
  kind: 'interest';
}
export interface Need {
  id: string;
  owner: { kind: 'activity' | 'case'; id: string; revision: number };
  description: string;
}
export interface DomainGraph {
  actors: readonly Actor[];
  memberships: readonly ActorMembership[];
  activities: readonly Activity[];
  /** Historical snapshots, including current heads when supplied. */
  activityRevisions?: readonly Activity[];
  activityParties: readonly ActivityParty[];
  cases: readonly CollaborationCase[];
  interests: readonly ParticipationInterest[];
  needs: readonly Need[];
}
function requireValue(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function unique(values: readonly string[], label: string) {
  requireValue(values.every(v => typeof v === 'string' && v.trim().length > 0), 'Empty ' + label);
  requireValue(new Set(values).size === values.length, 'Duplicate ' + label);
}
function version(n: number) { requireValue(Number.isSafeInteger(n) && n > 0, 'Invalid revision'); }

/** Validates the minimum #4 graph; source, auth and DB checks remain #5-#8. */
export function validateDomainGraph(graph: DomainGraph): void {
  unique(graph.actors.map(a => a.id), 'actor');
  unique(graph.activities.map(a => a.id), 'activity');
  unique(graph.cases.map(c => c.id), 'case');
  unique(graph.needs.map(n => n.id), 'need');
  const actors = new Map(graph.actors.map(a => [a.id, a]));
  const activities = new Map(graph.activities.map(a => [a.id, a]));
  const revisions = graph.activityRevisions ?? graph.activities;
  unique(revisions.map(a => JSON.stringify([a.domain,a.id,a.revision])), 'activity revision');
  for (const r of revisions) {
    version(r.revision);
    const head = activities.get(r.id);
    requireValue(head && head.domain === r.domain && r.revision <= head.revision && r.title.trim(), 'Invalid activity history');
  }
  for (const head of graph.activities) {
    requireValue(revisions.some(r => r.id === head.id && r.domain === head.domain &&
      r.revision === head.revision && r.title === head.title), 'Missing current activity revision');
  }
  const findRevision = (id: string, revision: number) => revisions.find(r => r.id === id && r.revision === revision);
  const cases = new Map(graph.cases.map(c => [c.id, c]));
  for (const a of graph.actors) {
    requireValue(['public-catalog', 'simulation'].includes(a.domain), 'Invalid actor domain');
    requireValue(['person', 'organization', 'government-body'].includes(a.kind), 'Invalid actor kind');
    requireValue(a.displayName.trim(), 'Empty display name');
  }
  for (const a of graph.activities) {
    version(a.revision);
    requireValue(['public-catalog', 'simulation'].includes(a.domain), 'Invalid activity domain');
    requireValue(a.title.trim(), 'Empty activity title');
  }
  unique(graph.memberships.map(m => JSON.stringify([m.personId,m.organizationId])), 'membership');
  for (const m of graph.memberships) {
    const person = actors.get(m.personId), organization = actors.get(m.organizationId);
    requireValue(person?.kind === 'person' && organization && organization.kind !== 'person', 'Invalid membership');
    requireValue(person.domain === organization.domain, 'Cross-domain membership');
  }
  unique(graph.activityParties.map(p => JSON.stringify([p.activityId,p.actorId,p.role])), 'activity party');
  for (const p of graph.activityParties) {
    const a = activities.get(p.activityId), actor = actors.get(p.actorId);
    requireValue(a && actor && a.domain === actor.domain && p.role.trim(), 'Invalid activity party');
  }
  for (const c of graph.cases) {
    version(c.revision); version(c.activity.revision);
    const a = findRevision(c.activity.id, c.activity.revision);
    requireValue(c.mode === 'simulation', 'Simulation only');
    requireValue(a && a.domain === c.activity.domain && a.revision === c.activity.revision, 'Unknown activity revision');
    requireValue(['draft','requested','responded','coordinating','agreed','preparing'].includes(c.stage), 'Invalid stage');
    unique(c.parties.map(p => p.actorId), 'case party');
    for (const p of c.parties) {
      requireValue(actors.get(p.actorId)?.domain === 'simulation' && p.role.trim(), 'Simulation actors only');
    }
  }
  unique(graph.interests.map(i => JSON.stringify([i.caseId,i.actorId])), 'interest');
  for (const i of graph.interests) {
    requireValue(i.mode === 'simulation' && i.kind === 'interest' && cases.has(i.caseId) &&
      actors.get(i.actorId)?.domain === 'simulation', 'Invalid interest');
  }
  for (const n of graph.needs) {
    version(n.owner.revision);
    const owner = n.owner.kind === 'activity' ? findRevision(n.owner.id, n.owner.revision) :
      n.owner.kind === 'case' ? cases.get(n.owner.id) : undefined;
    requireValue(owner && owner.revision === n.owner.revision && n.description.trim(), 'Invalid need owner');
  }
}

/** Construction never imports approval or advances a case. Auth is checked by the caller. */
export function createCollaborationDraft(
  graph: DomainGraph, id: string, activity: CollaborationCase['activity'],
  parties: readonly CaseParty[]
): CollaborationCase {
  const value: CollaborationCase = {
    mode: 'simulation', id, activity: { ...activity }, revision: 1,
    stage: 'draft', parties: parties.map(p => ({ ...p }))
  };
  validateDomainGraph({ ...graph, cases: [...graph.cases, value] });
  return value;
}

/** Explicit M0 mapping. Existing reviews and advanced stages cannot become M1 approvals. */
export function migrateM0Draft(
  graph: DomainGraph,
  legacy: import('./index').SimulationCase,
  mapping: {
    activity: CollaborationCase['activity'];
    actorId: string;
    role: string;
  }
): CollaborationCase {
  requireValue(legacy.mode === 'simulation' && legacy.stage === 'draft', 'Only M0 drafts can migrate');
  requireValue(legacy.activityId === mapping.activity.id, 'Activity mapping mismatch');
  requireValue(legacy.profileId.trim(), 'Missing M0 profile');
  // Mapping is an explicit migration input, never an identity or delegation grant.
  return createCollaborationDraft(graph, legacy.id, mapping.activity, [
    { actorId: mapping.actorId, role: mapping.role }
  ]);
}
