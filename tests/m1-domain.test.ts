import { describe, expect, it } from 'vitest';
import { validateDomainGraph, type DomainGraph } from '../packages/domain/src/m1';
const make = (): DomainGraph => ({
  actors: [
    {id:'p',domain:'simulation',kind:'person',displayName:'架空個人',expertise:[{label:'expert',evidence:null}]},
    {id:'o',domain:'simulation',kind:'organization',displayName:'架空団体',expertise:[]},
    {id:'g',domain:'simulation',kind:'government-body',displayName:'架空行政',expertise:[]},
    {id:'public',domain:'public-catalog',kind:'organization',displayName:'テスト専用',expertise:[]}
  ],
  memberships:[{personId:'p',organizationId:'o',evidence:null}],
  activities:[{id:'a',domain:'simulation',revision:1,title:'架空活動'}],
  activityParties:[{activityId:'a',actorId:'p',role:'proposer'}],
  cases:['c1','c2'].map(id=>({mode:'simulation' as const,id,activity:{id:'a',domain:'simulation' as const,revision:1},
    revision:1,stage:'draft' as const,parties:[{actorId:'p',role:'candidate'},{actorId:'o',role:'candidate'},{actorId:'g',role:'consultation-candidate'}]})),
  interests:[{mode:'simulation',caseId:'c1',actorId:'p',kind:'interest'}],
  needs:[{id:'n',owner:{kind:'case',id:'c1',revision:1},description:'架空の人手'}]
});
describe('M1 minimum graph',()=>{
  it('represents two cases and multiple actors without implying agreement',()=>{
    const g = make();
    expect(()=>validateDomainGraph(g)).not.toThrow();
    expect(g.cases.every(c=>c.stage==='draft')).toBe(true);
    expect(g.interests[0].kind).toBe('interest');
    expect(g.memberships[0]).not.toHaveProperty('permissions');
    expect(g.actors[0].expertise[0].evidence).toBeNull();
  });
  it('rejects public actors as simulated parties',()=>{
    const g = make();
    expect(()=>validateDomainGraph({...g,cases:[{...g.cases[0],parties:[{actorId:'public',role:'candidate'}]}]})).toThrow('Simulation actors only');
  });
  it('rejects missing references and wrong revisions',()=>{
    const g=make();
    for(const activity of [{id:'missing',domain:'simulation' as const,revision:1},{id:'a',domain:'simulation' as const,revision:2}])
      expect(()=>validateDomainGraph({...g,cases:[{...g.cases[0],activity}]})).toThrow('Unknown activity revision');
    expect(()=>validateDomainGraph({...g,needs:[{...g.needs[0],owner:{kind:'case',id:'missing',revision:1}}]})).toThrow();
  });
  it('rejects duplicate parties, ids, invalid revisions and membership privilege shortcuts',()=>{
    const g=make();
    expect(()=>validateDomainGraph({...g,cases:[{...g.cases[0],parties:[g.cases[0].parties[0],g.cases[0].parties[0]]}]})).toThrow('Duplicate');
    expect(()=>validateDomainGraph({...g,actors:[...g.actors,g.actors[0]]})).toThrow('Duplicate');
    expect(()=>validateDomainGraph({...g,activities:[{...g.activities[0],revision:0}]})).toThrow('revision');
    expect(()=>validateDomainGraph({...g,memberships:[{personId:'p',organizationId:'public',evidence:null}]})).toThrow('Cross-domain');
  });
});
