import { validateDomainGraph, type Activity, type DomainGraph, type CollaborationCase } from './m1';

export interface SourceDocument {
  id: string; url: string; publisher: string; title: string;
  accessedOn: string; publishedOn: string | null; updatedOn: string | null;
  summary: string;
  urlStatus: 'unchecked' | 'checked';
  usage: { status: 'unchecked' | 'permitted' | 'restricted'; evidence: string | null };
}
export interface SourceAssertion {
  id: string;
  target: { activityId: string; revision: number; field: 'title' | 'summary' | 'recruitment' };
  sourceId: string;
  value: string;
  status: 'unverified' | 'confirmed' | 'conflicting';
  checkedBy: string | null; checkedAt: string | null;
}
export interface ProvenanceGraph extends DomainGraph {
  activityRevisions: readonly Activity[];
  sources: readonly SourceDocument[];
  assertions: readonly SourceAssertion[];
}
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function text(v: unknown): v is string { return typeof v === 'string' && v.trim().length > 0; }
function day(v: string) {
  check(/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0,10) === v, 'Invalid source date');
}
function keys(value: object, allowed: readonly string[]) {
  check(Object.keys(value).every(k=>allowed.includes(k)), 'Unexpected provenance field');
}
function unique(ids: readonly string[]) {
  check(ids.every(text) && new Set(ids).size === ids.length, 'Invalid provenance IDs');
}
/** Pure validation only: no URL fetch, collection, permission grant or publication. */
export function validateProvenanceGraph(graph: ProvenanceGraph): void {
  validateDomainGraph(graph);
  for (const c of graph.cases) {
    keys(c,['mode','id','activity','revision','stage','parties']);
    keys(c.activity,['id','domain','revision']);
  }
  unique(graph.sources.map(s=>s.id));
  unique(graph.assertions.map(s=>s.id));
  for (const r of graph.activityRevisions) keys(r,['id','domain','revision','title']);
  for (const s of graph.sources) {
    keys(s,['id','url','publisher','title','accessedOn','publishedOn','updatedOn','summary','urlStatus','usage']);
    keys(s.usage,['status','evidence']);
    check(text(s.publisher) && text(s.title) && text(s.summary), 'Missing source metadata');
    let url: URL; try { url=new URL(s.url); } catch { throw new Error('Invalid source URL'); }
    check(['http:','https:'].includes(url.protocol) && !url.username && !url.password, 'Invalid source URL');
    day(s.accessedOn);
    if (s.publishedOn !== null) day(s.publishedOn);
    if (s.updatedOn !== null) day(s.updatedOn);
    check(['unchecked','checked'].includes(s.urlStatus), 'Invalid URL status');
    check(['unchecked','permitted','restricted'].includes(s.usage.status), 'Invalid usage status');
    check(s.usage.evidence === null || text(s.usage.evidence), 'Invalid usage evidence');
    check(s.usage.status === 'unchecked' || text(s.usage.evidence), 'Usage evidence required');
  }
  const sources=new Set(graph.sources.map(s=>s.id));
  for (const a of graph.assertions) {
    keys(a,['id','target','sourceId','value','status','checkedBy','checkedAt']);
    keys(a.target,['activityId','revision','field']);
    check(graph.activityRevisions.some(r=>r.domain==='public-catalog' && r.id===a.target.activityId &&
      r.revision===a.target.revision), 'Unknown public assertion target');
    check(sources.has(a.sourceId) && text(a.value), 'Missing assertion source/value');
    check(['title','summary','recruitment'].includes(a.target.field), 'Invalid assertion field');
    check(['unverified','confirmed','conflicting'].includes(a.status), 'Invalid assertion status');
    const hasReviewer=text(a.checkedBy), hasTime=text(a.checkedAt);
    check((a.checkedBy===null && a.checkedAt===null) || (hasReviewer && hasTime &&
      /^\d{4}-\d{2}-\d{2}T/.test(a.checkedAt!) && Number.isFinite(Date.parse(a.checkedAt!))), 'Invalid assertion review');
    check(a.status==='unverified' || (hasReviewer && hasTime), 'Assertion review required');
  }
  for (const r of graph.activityRevisions.filter(r=>r.domain==='public-catalog')) {
    check(graph.assertions.some(a=>a.target.activityId===r.id && a.target.revision===r.revision &&
      a.target.field==='title' && a.value===r.title), 'Public activity requires title provenance');
  }
}

/** Adds a new activity revision without overwriting old sources, assertions or snapshots. */
export function appendActivityRevision(
  graph: ProvenanceGraph, revision: Activity,
  sources: readonly SourceDocument[], assertions: readonly SourceAssertion[]
): ProvenanceGraph {
  validateProvenanceGraph(graph);
  const head=graph.activities.find(a=>a.id===revision.id);
  check(head ? head.domain===revision.domain && revision.revision===head.revision+1 : revision.revision===1,
    'Invalid next activity revision');
  const next: ProvenanceGraph=structuredClone({
    ...graph,
    activities:[...graph.activities.filter(a=>a.id!==revision.id),revision],
    activityRevisions:[...graph.activityRevisions,revision],
    sources:[...graph.sources,...sources],
    assertions:[...graph.assertions,...assertions]
  });
  validateProvenanceGraph(next);
  return next;
}

/** Allowlisted output retains the simulation label and never exports consent claims. */
export function exportSimulationCase(graph: ProvenanceGraph, id: string): {
  mode: 'simulation'; notice: string; case: CollaborationCase;
} {
  validateProvenanceGraph(graph);
  const c=graph.cases.find(c=>c.id===id);
  check(c, 'Unknown case');
  return {mode:'simulation',notice:'模擬検討。実在主体の参加・応答・合意を示さない。',
    case:{mode:'simulation',id:c.id,activity:{id:c.activity.id,domain:c.activity.domain,revision:c.activity.revision},
      revision:c.revision,stage:c.stage,parties:c.parties.map(p=>({actorId:p.actorId,role:p.role}))}};
}

/** Catalog export cannot carry case parties, interests, reviews or simulated activity records. */
export function exportPublicCatalog(graph: ProvenanceGraph) {
  validateProvenanceGraph(graph);
  return {
    kind:'public-catalog' as const,
    notice:'公開情報は募集継続・連絡許可・参加・合意を意味しない。',
    activities:graph.activityRevisions.filter(r=>r.domain==='public-catalog')
      .map(r=>({id:r.id,domain:r.domain,revision:r.revision,title:r.title})),
    sources:structuredClone(graph.sources),
    assertions:structuredClone(graph.assertions)
  };
}
