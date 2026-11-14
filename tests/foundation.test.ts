import { describe, expect, it } from 'vitest';
import { advanceSimulation, type SimulationCase, type PublicActivity, type SimulatedProfile } from '@satoyama/domain';
import { fixtureReviewer } from '@satoyama/ai-review';
import { geographicFit } from '@satoyama/matching';
import profiles from '../data/fixtures/simulated-profiles.json';
import activities from '../data/fixtures/public-activities.json';
const draft: SimulationCase = { mode:'simulation', id:'case-1', activityId:'activity-1', profileId:'sim-person-001', stage:'draft' };
const review = { reviewerId:'operator-1', decision:'approved' as const, reason:'模擬シナリオを確認', reviewedAt:'2026-11-14T00:00:00Z' };
describe('Phase 1 boundaries', () => {
  it('rejects unreviewed and rejected requests', () => {
    expect(() => advanceSimulation(draft,'requested')).toThrow('Human approval');
    expect(() => advanceSimulation({...draft, review:{...review,decision:'rejected'}},'requested')).toThrow();
  });
  it('requires sequential stages after human approval', () => {
    let value = { ...draft, review };
    expect(() => advanceSimulation(value,'agreed')).toThrow('Invalid stage');
    for (const stage of ['requested','coordinating','agreed','preparing'] as const) value = {...advanceSimulation(value,stage),review};
    expect(value.stage).toBe('preparing');
    expect(draft.stage).toBe('draft');
  });
  it('keeps fixture provenance distinct', () => {
    expect(activities).toEqual([]);
    expect(profiles.every(p => p.kind === 'simulated-profile' && p.id.startsWith('sim-'))).toBe(true);
  });
  it('does not turn recommendations into approval or invent geographic fit', async () => {
    const activity: PublicActivity = {kind:'public-activity',id:'test-only',title:'型検証専用',source:{url:'https://example.invalid',publisher:'test',accessedOn:'2026-11-14',summary:'not real data'}};
    const profile: SimulatedProfile = {kind:'simulated-profile',id:'sim-test',displayName:'模擬',skills:[]};
    expect((await fixtureReviewer.recommend(activity,profile)).status).toBe('requires-human-review');
    expect(geographicFit({activity,profile}).status).toBe('not-evaluated');
  });
});
