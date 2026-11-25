import { describe, expect, it } from 'vitest';
import { createSimulationWorkbench } from '../apps/web/lib/simulation-store';

describe('M4 Phase 1 end-to-end collaboration workbench flow', () => {
  it('enforces public/simulation separation, AI primary -> human review -> self-review ban -> material re-review -> sequential simulation stages', async () => {
    let tick = 0;
    const wb = createSimulationWorkbench({
      now: () => `2026-11-25T12:00:${String(tick++).padStart(2, '0')}Z`
    });

    // 1. Public catalog stays empty & strictly separated from simulation fixtures
    const initial = wb.getSnapshot();
    expect(initial.publicCatalog.activities).toEqual([]);
    expect(initial.publicCatalog.actors).toEqual([]);
    expect(initial.publicCatalog.fixtureActivityCount).toBe(0);
    expect(initial.simulationActors.every((a) => a.domain === 'simulation')).toBe(true);
    expect(initial.recommendations.length).toBeGreaterThan(0);
    expect(initial.recommendations.every((r) => r.canParticipate === null && r.qualificationVerified === false)).toBe(
      true
    );

    // 2. Propose a new simulated activity (with coordinates + date) & verify M2 matching updates
    const partial = wb.createActivityProposal('creator', {
      title: '座標片方だけ',
      locationLabel: 'x',
      latitude: 35.6,
      longitude: null,
      requiredSkills: [],
      transportModes: []
    });
    expect(partial.ok).toBe(false);
    if (!partial.ok) expect(partial.reasonCode).toBe('INVALID_LOCATION');

    const prop = wb.createActivityProposal('creator', {
      title: '里山ホタル生息地の草刈り',
      locationLabel: '西沢エリア（概算）',
      latitude: 35.645,
      longitude: 139.275,
      scheduleStartAt: '2026-12-13T09:00',
      requiredSkills: ['植生観察'],
      transportModes: ['地域バス']
    });
    expect(prop.ok).toBe(true);
    if (!prop.ok) return;
    expect(prop.activity.domain).toBe('simulation');
    expect(prop.snapshot.recommendations.length).toBeGreaterThan(0);
    const located = prop.snapshot.recommendations.find((r) => r.actorId === 'sim-person-002');
    expect(located?.geographic.distanceMeters).not.toBeNull();
    const newCond = prop.snapshot.participationConditions.find((c) => c.target.activityId === prop.activity.id);
    expect(newCond?.schedule.dates).toEqual({
      state: 'specified',
      value: [{ startAt: '2026-12-13T09:00:00+09:00', endAt: null, label: '模擬活動日（提案時入力）' }]
    });

    // 3. Create a draft collaboration case from M2 recommendation
    const created = wb.createDraftCase('creator', {
      activityId: prop.activity.id,
      candidateActorId: 'sim-person-002'
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const caseId = created.caseId;

    // 4. Transition BEFORE AI & human review MUST fail and record denied audit
    const earlyTransition = await wb.advanceCaseStage('coordinator', {
      caseId,
      expectedVersion: 1,
      targetStage: 'requested'
    });
    expect(earlyTransition.ok).toBe(false);
    if (!earlyTransition.ok) {
      expect(earlyTransition.reasonCode).toBe('HUMAN_APPROVAL_REQUIRED');
      expect(earlyTransition.deniedAuditEvent.outcome).toBe('denied');
    }

    // 4b. Human review BEFORE AI primary review MUST be denied (requirement 4: AI first, then human)
    const reviewBeforeAI = await wb.submitHumanReview('reviewer', {
      caseId,
      expectedVersion: 1,
      decision: 'approved',
      reason: 'AI評価前に承認を試みる'
    });
    expect(reviewBeforeAI.ok).toBe(false);
    if (!reviewBeforeAI.ok) expect(reviewBeforeAI.reasonCode).toBe('AI_RECOMMENDATION_REQUIRED');

    // 5. Run M3 AI Primary Review — STILL must not unlock transition
    const aiRes = await wb.runAIPrimaryReview(caseId);
    expect(aiRes.ok).toBe(true);
    if (!aiRes.ok) return;
    expect(aiRes.assessment.status).toBe('requires-human-review');
    expect(aiRes.assessment.provenance.externalApiCalled).toBe(false);

    const aiOnlyTransition = await wb.advanceCaseStage('coordinator', {
      caseId,
      expectedVersion: 1,
      targetStage: 'requested'
    });
    expect(aiOnlyTransition.ok).toBe(false);
    if (!aiOnlyTransition.ok) expect(aiOnlyTransition.reasonCode).toBe('HUMAN_APPROVAL_REQUIRED');

    // 6. Self-review by creator MUST be denied; anonymous review MUST be denied
    const selfReview = await wb.submitHumanReview('creator', {
      caseId,
      expectedVersion: 1,
      decision: 'approved',
      reason: '自分で承認を試みる',
      aiRecommendationId: aiRes.assessment.record.id
    });
    expect(selfReview.ok).toBe(false);
    if (!selfReview.ok) expect(selfReview.reasonCode).toBe('SELF_REVIEW_PROHIBITED');

    const anonReview = await wb.submitHumanReview('anonymous', {
      caseId,
      expectedVersion: 1,
      decision: 'approved',
      reason: '未認証で承認を試みる'
    });
    expect(anonReview.ok).toBe(false);
    if (!anonReview.ok) expect(anonReview.reasonCode).toBe('UNAUTHENTICATED');

    // 7. Independent reviewer approves rev 1
    const approvedRev1 = await wb.submitHumanReview('reviewer', {
      caseId,
      expectedVersion: 1,
      decision: 'approved',
      reason: '第三者としてAI評価・未確認事項を確認し承認',
      aiRecommendationId: aiRes.assessment.record.id
    });
    expect(approvedRev1.ok).toBe(true);

    // 8. Stage skipping (draft -> agreed) MUST be rejected
    const skipRes = await wb.advanceCaseStage('coordinator', {
      caseId,
      expectedVersion: 1,
      targetStage: 'agreed'
    });
    expect(skipRes.ok).toBe(false);
    if (!skipRes.ok) expect(skipRes.reasonCode).toBe('INVALID_STAGE_TRANSITION');

    // 9. Sequential transitions draft -> requested -> coordinating succeed with simulated notes
    const toRequested = await wb.advanceCaseStage('coordinator', {
      caseId,
      expectedVersion: 1,
      targetStage: 'requested',
      simulationNote: '模擬依頼を発行'
    });
    expect(toRequested.ok).toBe(true);

    // requested -> coordinating skipping the simulated response MUST be rejected
    const skipResponse = await wb.advanceCaseStage('coordinator', {
      caseId,
      expectedVersion: 1,
      targetStage: 'coordinating'
    });
    expect(skipResponse.ok).toBe(false);
    if (!skipResponse.ok) expect(skipResponse.reasonCode).toBe('INVALID_STAGE_TRANSITION');

    const toResponded = await wb.advanceCaseStage('coordinator', {
      caseId,
      expectedVersion: 1,
      targetStage: 'responded',
      simulationNote: '模擬応答（参加意向あり）を記録'
    });
    expect(toResponded.ok).toBe(true);

    const toCoordinating = await wb.advanceCaseStage('coordinator', {
      caseId,
      expectedVersion: 1,
      targetStage: 'coordinating',
      simulationNote: '模擬調整を開始'
    });
    expect(toCoordinating.ok).toBe(true);

    // 10. Material change increments revision (1 -> 2) and invalidates rev 1 approval
    const matChange = await wb.applyMaterialChange('creator', {
      caseId,
      expectedVersion: 1,
      changeKind: 'participation-condition',
      changeSummary: '安全管理条件を変更'
    });
    expect(matChange.ok).toBe(true);

    const blockedAfterChange = await wb.advanceCaseStage('coordinator', {
      caseId,
      expectedVersion: 2,
      targetStage: 'agreed'
    });
    expect(blockedAfterChange.ok).toBe(false);
    if (!blockedAfterChange.ok) expect(blockedAfterChange.reasonCode).toBe('HUMAN_APPROVAL_REQUIRED');

    // 11. Re-run AI primary review + independent human review on rev 2, then finish agreed -> preparing
    const aiRev2 = await wb.runAIPrimaryReview(caseId);
    expect(aiRev2.ok).toBe(true);
    if (!aiRev2.ok) return;

    const approvedRev2 = await wb.submitHumanReview('reviewer', {
      caseId,
      expectedVersion: 2,
      decision: 'approved',
      reason: 'rev 2 の安全条件変更を再審査し承認',
      aiRecommendationId: aiRev2.assessment.record.id
    });
    expect(approvedRev2.ok).toBe(true);

    const toAgreed = await wb.advanceCaseStage('coordinator', {
      caseId,
      expectedVersion: 2,
      targetStage: 'agreed'
    });
    expect(toAgreed.ok).toBe(true);

    const toPreparing = await wb.advanceCaseStage('coordinator', {
      caseId,
      expectedVersion: 2,
      targetStage: 'preparing'
    });
    expect(toPreparing.ok).toBe(true);
    if (!toPreparing.ok) return;

    const finalCase = toPreparing.snapshot.cases.find((c) => c.id === caseId);
    expect(finalCase?.stage).toBe('preparing');
    expect(finalCase?.revision).toBe(2);
    expect(toPreparing.snapshot.reviewRecords.filter((r) => r.caseId === caseId)).toHaveLength(2);
    expect(toPreparing.snapshot.collaborationNotes.filter((n) => n.caseId === caseId)).toHaveLength(5);
    expect(toPreparing.snapshot.collaborationNotes.every((n) => n.externalContactSent === false)).toBe(true);
    expect(toPreparing.snapshot.auditEvents.some((e) => e.reasonCode === 'SELF_REVIEW_PROHIBITED')).toBe(true);
    expect(toPreparing.snapshot.auditEvents.some((e) => e.reasonCode === 'STAGE_TRANSITIONED')).toBe(true);
  });
});
