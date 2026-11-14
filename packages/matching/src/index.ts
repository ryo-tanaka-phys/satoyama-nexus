import type { PublicActivity, SimulatedProfile } from '@satoyama/domain';
export interface GeographicFit { status: 'not-evaluated'; reason: string }
export interface MatchingInput { activity: PublicActivity; profile: SimulatedProfile }
/** M0 does not invent distances, rankings, or geographic suitability. */
export function geographicFit(_input: MatchingInput): GeographicFit {
  return { status: 'not-evaluated', reason: 'PostGIS distance and travel constraints are deferred to M2' };
}
