import { describe, expect, it } from 'vitest';
import { createCollaborationDraft, migrateM0Draft, type DomainGraph } from '../packages/domain/src/m1';
import type { SimulationCase } from '../packages/domain/src';
const graph: DomainGraph = {
  actors:[{id:'p',domain:'simulation',kind:'person',displayName:'架空個人',expertise:[]}],
  activities:[{id:'a',domain:'simulation',revision:1,title:'架空活動'}],
  memberships:[],activityParties:[],cases:[],interests:[],needs:[]
};
const activity={id:'a',domain:'simulation' as const,revision:1};
const legacy: SimulationCase={mode:'simulation',id:'legacy',activityId:'a',profileId:'old-profile',stage:'draft',
  review:{reviewerId:'unverified',decision:'approved',reason:'old',reviewedAt:'2026-11-14'}};
describe('M1 draft construction and M0 migration',()=>{
  it('allows an unaffiliated person and copies input without implying participation',()=>{
    const parties=[{actorId:'p',role:'candidate'}];
    const value=createCollaborationDraft(graph,'c',activity,parties);
    parties[0].role='changed';
    expect(value.parties[0].role).toBe('candidate');
    expect(value.stage).toBe('draft');
    expect(graph.cases).toEqual([]);
  });
  it('does not carry an M0 review into M1',()=>{
    const value=migrateM0Draft(graph,legacy,{activity,actorId:'p',role:'candidate'});
    expect(value).not.toHaveProperty('review');
    expect(value.mode).toBe('simulation');
    expect(legacy).toHaveProperty('review');
  });
  it('rejects advanced stages and invalid explicit mappings',()=>{
    expect(()=>migrateM0Draft(graph,{...legacy,stage:'agreed'},{activity,actorId:'p',role:'candidate'})).toThrow('Only M0 drafts');
    expect(()=>migrateM0Draft(graph,legacy,{activity:{...activity,id:'other'},actorId:'p',role:'candidate'})).toThrow('mapping mismatch');
    expect(()=>migrateM0Draft(graph,legacy,{activity,actorId:'absent',role:'candidate'})).toThrow('Simulation actors only');
  });
});
