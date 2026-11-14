/** Public activity records never imply participation or consent. */
export interface PublicActivity {
  kind: 'public-activity'; id: string; title: string;
  source: { url: string; publisher: string; accessedOn: string; summary: string };
  location?: { latitude: number; longitude: number; precision: 'approximate' | 'venue' };
}
export interface SimulatedProfile {
  kind: 'simulated-profile'; id: string; displayName: string; skills: string[];
}
export type CollaborationStage = 'draft' | 'requested' | 'coordinating' | 'agreed' | 'preparing';
export interface HumanReview {
  reviewerId: string; decision: 'approved' | 'rejected'; reason: string; reviewedAt: string;
}
export interface SimulationCase {
  mode: 'simulation'; id: string; activityId: string; profileId: string;
  stage: CollaborationStage; review?: HumanReview;
}
const nextStage: Partial<Record<CollaborationStage, CollaborationStage>> = {
  draft: 'requested', requested: 'coordinating', coordinating: 'agreed', agreed: 'preparing'
};
export function advanceSimulation(value: SimulationCase, target: CollaborationStage): SimulationCase {
  if (value.mode !== 'simulation') throw new Error('Simulation only');
  if (value.review?.decision !== 'approved' || !value.review.reviewerId.trim() || !value.review.reason.trim()) {
    throw new Error('Human approval with a reason is required');
  }
  if (nextStage[value.stage] !== target) throw new Error('Invalid stage transition');
  return { ...value, stage: target };
}

export * from './m1';

export * from './provenance';

export * from './actor-provenance';
