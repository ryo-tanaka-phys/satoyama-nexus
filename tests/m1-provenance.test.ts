import { describe, expect, it } from 'vitest';
import { appendActivityRevision, validateProvenanceGraph, exportSimulationCase, exportPublicCatalog,
  type ProvenanceGraph, type SourceDocument, type SourceAssertion } from '../packages/domain/src/provenance';
const source=(id='s1'): SourceDocument=>({
  id,url:'https://example.invalid/test-only',publisher:'架空テスト発行者',title:'テスト資料',
  accessedOn:'2026-11-14',publishedOn:null,updatedOn:null,summary:'実在情報ではないテスト',
  urlStatus:'unchecked',usage:{status:'unchecked',evidence:null}
});
const assertion=(id='x1',revision=1,value='テスト活動',sourceId='s1'):SourceAssertion=>({
  id,target:{activityId:'a',revision,field:'title'},sourceId,value,status:'unverified',checkedBy:null,checkedAt:null
});
const make=(): ProvenanceGraph=>({
  actors:[{id:'p',domain:'simulation',kind:'person',displayName:'架空',expertise:[]}],
  memberships:[],activities:[{id:'a',domain:'public-catalog',revision:1,title:'テスト活動'}],
  activityRevisions:[{id:'a',domain:'public-catalog',revision:1,title:'テスト活動'}],
  activityParties:[],cases:[{mode:'simulation',id:'c',activity:{id:'a',domain:'public-catalog',revision:1},
    revision:1,stage:'draft',parties:[{actorId:'p',role:'candidate'}]}],
  interests:[],needs:[],sources:[source()],assertions:[assertion()]
});
describe('M1 provenance and separation',()=>{
  it('retains contradictory sources and pins a case to its historical activity revision',()=>{
    const g=make();
    const next=appendActivityRevision(g,{id:'a',domain:'public-catalog',revision:2,title:'改訂'},
      [source('s2')],[assertion('x2',2,'改訂','s2'),{...assertion('x3',1,'矛盾情報','s2'),
        status:'conflicting',checkedBy:'test-reviewer',checkedAt:'2026-11-14T00:00:00Z'}]);
    expect(next.activityRevisions).toHaveLength(2);
    expect(next.assertions).toHaveLength(3);
    expect(next.cases[0].activity.revision).toBe(1);
    expect(g.activities[0].revision).toBe(1);
    expect(()=>validateProvenanceGraph(JSON.parse(JSON.stringify(next)))).not.toThrow();
    next.sources[0].summary='changed copy';
    expect(g.sources[0].summary).not.toBe('changed copy');
  });
  it('rejects missing source provenance, invalid URLs/dates and unreviewed conflict claims',()=>{
    const g=make();
    expect(()=>validateProvenanceGraph({...g,assertions:[]})).toThrow('requires title provenance');
    expect(()=>validateProvenanceGraph({...g,sources:[]})).toThrow('Missing assertion source');
    for (const url of ['file:///test','javascript:alert(1)','https://user:password@example.invalid'])
      expect(()=>validateProvenanceGraph({...g,sources:[{...source(),url}]})).toThrow('Invalid source URL');
    expect(()=>validateProvenanceGraph({...g,sources:[{...source(),accessedOn:'2026-02-30'}]})).toThrow('date');
    expect(()=>validateProvenanceGraph({...g,assertions:[{...assertion(),status:'confirmed'}]})).toThrow('review required');
    expect(()=>validateProvenanceGraph({...g,sources:[{...source(),usage:{status:'permitted',evidence:null}}]})).toThrow('evidence required');
  });
  it('rejects overwrites, skipped versions and domain promotion',()=>{
    const g=make();
    expect(()=>appendActivityRevision(g,{...g.activities[0],title:'overwrite'},[],[])).toThrow('next activity revision');
    expect(()=>appendActivityRevision(g,{...g.activities[0],revision:3},[],[])).toThrow('next activity revision');
    expect(()=>appendActivityRevision(g,{...g.activities[0],domain:'simulation',revision:2},[],[])).toThrow('next activity revision');
    expect(()=>appendActivityRevision(g,{...g.activities[0],revision:2},[source()],[assertion('x2',2)])).toThrow('IDs');
  });
  it('keeps simulation output labelled and strips simulated participation from catalog export',()=>{
    const g=make();
    expect(exportSimulationCase(g,'c').mode).toBe('simulation');
    expect(exportSimulationCase(g,'c').notice).toContain('模擬');
    expect(()=>validateProvenanceGraph({...g,cases:[{...g.cases[0],
      activity:{...g.cases[0].activity,simulatedActivityId:'second'} as any}]})).toThrow('Unexpected');
    const sim=appendActivityRevision(g,{id:'fiction',domain:'simulation',revision:1,title:'完全架空'},[],[]);
    expect(exportPublicCatalog(sim).activities.some(a=>a.id==='fiction')).toBe(false);
    const catalog=exportPublicCatalog(g);
    expect(catalog).not.toHaveProperty('cases');
    expect(catalog).not.toHaveProperty('interests');
    expect(catalog.activities[0]).not.toHaveProperty('parties');
    expect(catalog.sources[0].usage.status).toBe('unchecked');
    expect(()=>validateProvenanceGraph({...g,activityRevisions:[{...g.activityRevisions[0],stage:'agreed'} as any]})).toThrow('Unexpected');
    expect(()=>validateProvenanceGraph({...g,cases:[{...g.cases[0],activity:{...g.cases[0].activity,domain:'simulation'}}]})).toThrow('Unknown activity');
  });
});
