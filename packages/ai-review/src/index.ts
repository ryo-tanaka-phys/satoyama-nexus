import type { PublicActivity, SimulatedProfile } from '@satoyama/domain';
export interface PrimaryRecommendation {
  activityId: string; profileId: string; status: 'requires-human-review';
  provenance: { provider: string; model: string; promptVersion: string; createdAt: string };
  reasons: string[]; limitations: string[];
}
export interface RecommendationProvider {
  recommend(activity: PublicActivity, profile: SimulatedProfile): Promise<PrimaryRecommendation>;
}
/** Deterministic fixture adapter; it never calls an AI service or contacts anyone. */
export const fixtureReviewer: RecommendationProvider = {
  async recommend(activity, profile) {
    return { activityId: activity.id, profileId: profile.id, status: 'requires-human-review',
      provenance: { provider: 'fixture', model: 'none', promptVersion: 'm0', createdAt: '2026-11-14T00:00:00Z' },
      reasons: ['模擬推薦：人間による適合性の確認が必要です'],
      limitations: ['AI未接続', '地理条件・活動の募集状況・同意は未確認'] };
  }
};

export * from './m3';
