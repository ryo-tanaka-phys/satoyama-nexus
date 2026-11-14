import { describe, expect, it } from 'vitest';
import { appendActorRevision, validateActorProvenanceGraph, exportCatalogWithActors,
  type ActorProvenanceGraph, type ActorSourceAssertion } from '../packages/domain/src/actor-provenance';
import type { Actor } from '../packages/domain/src/m1';
const actor:Actor={id:'public-test',domain:'public-catalog',kind:'organization',displayName:'架空テスト主体',expertise:[]};
const assertions=(revision=1,value=actor):ActorSourceAssertion[]=>(
  ['displayName','kind','expertise'] as const).map(field=>({
    id:field+'-'+revision,target:{actorId:value.id,revision,field},sourceId:'s',
    value:field==='expertise'?JSON.stringify(value.expertise):value[field],
    status:'unverified',checkedBy:null,checkedAt:null
  }));
const make=():ActorProvenanceGraph=>({
  actors:[actor],actorRevisions:[{actor,revision:1}],actorAssertions:assertions(),
  memberships:[],activities:[],activityRevisions:[],activityParties:[],cases:[],interests:[],needs:[],
  sources:[{id:'s',url:'https://example.invalid/test-only',publisher:'架空テスト',title:'資料',
    accessedOn:'2026-11-14',publishedOn:null,updatedOn:null,summary:'テストのみ',
    urlStatus:'unchecked',usage:{status:'unchecked',evidence:null}}],assertions:[]
});
describe('public actor provenance',()=>{
  it('retains old actor fields and contradictory source claims without creating accounts',()=>{
    const g=make(), updated={...actor,displayName:'改訂名',expertise:[{label:'expert',evidence:null}]};
    const next=appendActorRevision(g,{actor:updated,revision:2},[
      ...assertions(2,updated),
      {...assertions()[0],id:'conflict',value:'矛盾名',status:'conflicting',checkedBy:'test-reviewer',checkedAt:'2026-11-14T00:00:00Z'}
    ]);
    expect(next.actorRevisions).toHaveLength(2);
    expect(next.actorRevisions[0].actor.displayName).toBe(actor.displayName);
    expect(next.actorAssertions).toHaveLength(7);
    expect(next).not.toHaveProperty('accounts');
    expect(next.actors[0].expertise[0].evidence).toBeNull();
    expect(()=>validateActorProvenanceGraph(JSON.parse(JSON.stringify(next)))).not.toThrow();
    expect(g.actors[0].displayName).toBe(actor.displayName);
  });
  it('rejects missing field sources, unknown versions and unverified confirmation',()=>{
    const g=make();
    expect(()=>validateActorProvenanceGraph({...g,actorAssertions:[]})).toThrow('requires field provenance');
    expect(()=>validateActorProvenanceGraph({...g,actorAssertions:g.actorAssertions.map(a=>({...a,sourceId:'missing'}))})).toThrow('Missing actor assertion source');
    expect(()=>validateActorProvenanceGraph({...g,actorAssertions:[...g.actorAssertions,{...g.actorAssertions[0],id:'unknown',target:{...g.actorAssertions[0].target,revision:9}}]})).toThrow('Unknown public actor revision');
    expect(()=>validateActorProvenanceGraph({...g,actorAssertions:[{...g.actorAssertions[0],status:'confirmed'},...g.actorAssertions.slice(1)]})).toThrow('review required');
  });
  it('rejects version overwrite, domain promotion and missing histories',()=>{
    const g=make();
    expect(()=>appendActorRevision(g,{actor,revision:1},[])).toThrow('next actor revision');
    expect(()=>appendActorRevision(g,{actor:{...actor,domain:'simulation'},revision:2},[])).toThrow('classification');
    expect(()=>validateActorProvenanceGraph({...g,actorRevisions:[]})).toThrow('Missing actor history');
    expect(()=>validateActorProvenanceGraph({...g,actors:[{...actor,displayName:'unversioned'}]})).toThrow('head mismatch');
  });
  it('exports only public actor snapshots with provenance and no privileges',()=>{
    const g=make();
    const sim:Actor={...actor,id:'sim-test',domain:'simulation'};
    const next=appendActorRevision(g,{actor:sim,revision:1},[]);
    const out=exportCatalogWithActors(next);
    expect(out.actors).toHaveLength(1);
    expect(out.actors[0].actor.id).toBe('public-test');
    expect(out).not.toHaveProperty('memberships');
    expect(out).not.toHaveProperty('accounts');
    expect(out.actorAssertions).toHaveLength(3);
    expect(()=>validateActorProvenanceGraph({...g,actorRevisions:[{actor:{...actor,permissions:['review']} as any,revision:1}]})).toThrow('Unexpected');
  });
});
