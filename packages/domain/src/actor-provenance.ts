import type { Actor } from './m1';
import { validateProvenanceGraph, exportPublicCatalog, type ProvenanceGraph } from './provenance';

export interface ActorRevision { actor: Actor; revision: number; }
export interface ActorSourceAssertion {
  id: string;
  target: { actorId: string; revision: number; field: 'displayName' | 'kind' | 'expertise' };
  sourceId: string; value: string;
  status: 'unverified' | 'confirmed' | 'conflicting';
  checkedBy: string | null; checkedAt: string | null;
}
export interface ActorProvenanceGraph extends ProvenanceGraph {
  actorRevisions: readonly ActorRevision[];
  actorAssertions: readonly ActorSourceAssertion[];
}
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function text(v: unknown): v is string { return typeof v === 'string' && v.trim().length > 0; }
function keys(o: object, allowed: readonly string[]) {
  check(Object.keys(o).every(k=>allowed.includes(k)), 'Unexpected actor provenance field');
}
function canonical(a: Actor) {
  return JSON.stringify([a.id,a.domain,a.kind,a.displayName,a.expertise.map(e=>[e.label,e.evidence])]);
}
export function validateActorProvenanceGraph(g: ActorProvenanceGraph): void {
  validateProvenanceGraph(g);
  const revisions=new Set<string>();
  for (const r of g.actorRevisions) {
    keys(r,['actor','revision']); keys(r.actor,['id','domain','kind','displayName','expertise']);
    check(Number.isSafeInteger(r.revision) && r.revision>0, 'Invalid actor revision');
    const head=g.actors.find(a=>a.id===r.actor.id);
    check(head && head.domain===r.actor.domain && head.kind===r.actor.kind &&
      text(r.actor.displayName), 'Invalid actor history');
    for (const e of r.actor.expertise) {
      keys(e,['label','evidence']);
      check(text(e.label) && (e.evidence===null || text(e.evidence)), 'Invalid expertise');
    }
    const key=JSON.stringify([r.actor.id,r.revision]);
    check(!revisions.has(key), 'Duplicate actor revision'); revisions.add(key);
  }
  for (const head of g.actors) {
    const history=g.actorRevisions.filter(r=>r.actor.id===head.id).sort((a,b)=>a.revision-b.revision);
    check(history.length>0 && history.every((r,i)=>r.revision===i+1), 'Missing actor history');
    check(canonical(history[history.length-1].actor)===canonical(head), 'Actor head mismatch');
  }
  const ids=new Set<string>();
  for (const a of g.actorAssertions) {
    keys(a,['id','target','sourceId','value','status','checkedBy','checkedAt']);
    keys(a.target,['actorId','revision','field']);
    check(text(a.id) && !ids.has(a.id), 'Invalid actor assertion ID'); ids.add(a.id);
    check(g.actorRevisions.some(r=>r.actor.domain==='public-catalog' &&
      r.actor.id===a.target.actorId && r.revision===a.target.revision), 'Unknown public actor revision');
    check(g.sources.some(s=>s.id===a.sourceId) && text(a.value), 'Missing actor assertion source/value');
    check(['displayName','kind','expertise'].includes(a.target.field), 'Invalid actor assertion field');
    check(['unverified','confirmed','conflicting'].includes(a.status), 'Invalid actor assertion status');
    const reviewed=text(a.checkedBy) && text(a.checkedAt) &&
      /^\d{4}-\d{2}-\d{2}T/.test(a.checkedAt) && Number.isFinite(Date.parse(a.checkedAt));
    check((a.checkedBy===null && a.checkedAt===null) || reviewed, 'Invalid actor assertion review');
    check(a.status==='unverified' || reviewed, 'Actor assertion review required');
  }
  for (const r of g.actorRevisions.filter(r=>r.actor.domain==='public-catalog')) {
    for (const field of ['displayName','kind','expertise'] as const) {
      const value=field==='expertise' ? JSON.stringify(r.actor.expertise) : r.actor[field];
      check(g.actorAssertions.some(a=>a.target.actorId===r.actor.id && a.target.revision===r.revision &&
        a.target.field===field && a.value===value), 'Public actor requires field provenance');
    }
  }
}
/** Caller must separately authorize this operation; no identity or permission is inferred. */
export function appendActorRevision(
  g: ActorProvenanceGraph, revision: ActorRevision, assertions: readonly ActorSourceAssertion[]
): ActorProvenanceGraph {
  validateActorProvenanceGraph(g);
  const history=g.actorRevisions.filter(r=>r.actor.id===revision.actor.id);
  const latest=history.reduce((n,r)=>Math.max(n,r.revision),0);
  check(revision.revision===latest+1, 'Invalid next actor revision');
  const old=g.actors.find(a=>a.id===revision.actor.id);
  check(!old || (old.domain===revision.actor.domain && old.kind===revision.actor.kind), 'Actor classification change requires review');
  const next:ActorProvenanceGraph=structuredClone({...g,
    actors:[...g.actors.filter(a=>a.id!==revision.actor.id),revision.actor],
    actorRevisions:[...g.actorRevisions,revision],actorAssertions:[...g.actorAssertions,...assertions]});
  validateActorProvenanceGraph(next);
  return next;
}
/** Transfer contract only. Publication policies and authentication remain separate. */
export function exportCatalogWithActors(g: ActorProvenanceGraph) {
  validateActorProvenanceGraph(g);
  return {...exportPublicCatalog(g),
    actors:g.actorRevisions.filter(r=>r.actor.domain==='public-catalog').map(r=>({
      revision:r.revision,actor:{id:r.actor.id,domain:r.actor.domain,kind:r.actor.kind,
        displayName:r.actor.displayName,expertise:r.actor.expertise.map(e=>({label:e.label,evidence:e.evidence}))}
    })), actorAssertions:structuredClone(g.actorAssertions)};
}
