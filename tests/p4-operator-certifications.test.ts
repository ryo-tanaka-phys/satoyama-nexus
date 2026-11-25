import { describe, expect, it } from 'vitest';
import { checkCertifiedOrganizationAccess } from '@satoyama/domain';
import { POST as loginPost } from '../apps/web/app/api/venue/login/route';
import { GET as sessionGet } from '../apps/web/app/api/venue/session/route';
import { POST as submitCertPost } from '../apps/web/app/api/venue/certifications/route';
import { POST as reviewCertPost } from '../apps/web/app/api/venue/certifications/[requestId]/review/route';
import { POST as mediatedMatchPost } from '../apps/web/app/api/venue/operator/mediated-match/route';
import { POST as addCommentPost } from '../apps/web/app/api/venue/posts/[postId]/comments/route';
import { getActiveVenueFoundationStore } from '../apps/web/lib/venue-runtime';

async function loginAs(accountId: string): Promise<string> {
  const res = await loginPost(
    new Request('http://localhost:3000/api/venue/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId })
    })
  );
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  return setCookie!.split(';')[0];
}

describe('P4 Operator Governance, Certifications (Legal-Entity & Expert), and Mediated Strict Review', () => {
  it('certifies an uncertified organization via operator approval, blocks non-operators, and unlocks org gate', async () => {
    const orgCookie = await loginAs('demo-acct-org');
    const citizenCookie = await loginAs('demo-acct-citizen');
    const operatorCookie = await loginAs('demo-acct-operator');

    // Before certification: org gate denies access
    const store = getActiveVenueFoundationStore();
    const beforeResolved = await store.resolveSessionByToken(decodeURIComponent(orgCookie.split('=')[1]));
    const gateBefore = checkCertifiedOrganizationAccess(beforeResolved.authContext, beforeResolved.profile);
    expect(gateBefore.ok).toBe(false);

    // Organization submits legal-entity certification request
    const subRes = await submitCertPost(
      new Request('http://localhost:3000/api/venue/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({
          kind: 'organization',
          summary: '伊都里山みらいの会の団体認証と責任者権限付与を申請します。',
          evidenceNote: 'ダミーメンバー2名登録済み・月1回活動予定'
        })
      })
    );
    expect(subRes.status).toBe(200);
    const subBody = (await subRes.json()) as { ok: boolean; request: { id: string; status: string } };
    expect(subBody.request.status).toBe('pending');

    // Non-operator cannot review (403)
    const nonOpRes = await reviewCertPost(
      new Request(`http://localhost:3000/api/venue/certifications/${subBody.request.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: citizenCookie },
        body: JSON.stringify({ decision: 'approved', reason: '市民による不正承認試行' })
      }),
      { params: Promise.resolve({ requestId: subBody.request.id }) }
    );
    expect(nonOpRes.status).toBe(403);

    // Operator approves with reason
    const approveRes = await reviewCertPost(
      new Request(`http://localhost:3000/api/venue/certifications/${subBody.request.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({
          decision: 'approved',
          reason: '活動体制・根拠を確認したため法人格・責任者認証を承認します。'
        })
      }),
      { params: Promise.resolve({ requestId: subBody.request.id }) }
    );
    expect(approveRes.status).toBe(200);

    // After certification: org gate succeeds and org receives notification
    const afterResolved = await store.resolveSessionByToken(decodeURIComponent(orgCookie.split('=')[1]));
    expect(afterResolved.profile?.orgCertificationStatus).toBe('certified');
    expect(checkCertifiedOrganizationAccess(afterResolved.authContext, afterResolved.profile)).toEqual({ ok: true });

    const orgPoll = await sessionGet(
      new Request('http://localhost:3000/api/venue/session', { headers: { cookie: orgCookie } })
    );
    const orgPollBody = (await orgPoll.json()) as { notifications: { category: string }[] };
    expect(orgPollBody.notifications.some((n) => n.category === 'certification')).toBe(true);
  });

  it('certifies an expert candidate under citizen track and auto-tags subsequent comments as expert advice', async () => {
    const expertCookie = await loginAs('demo-acct-expert');
    const operatorCookie = await loginAs('demo-acct-operator');

    const subRes = await submitCertPost(
      new Request('http://localhost:3000/api/venue/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: expertCookie },
        body: JSON.stringify({
          kind: 'expert',
          summary: '植物生態学および野外安全管理の資格認証を申請します。',
          evidenceNote: '模擬・研究実績および安全講習修了'
        })
      })
    );
    expect(subRes.status).toBe(200);
    const { request } = (await subRes.json()) as { request: { id: string } };

    const approveRes = await reviewCertPost(
      new Request(`http://localhost:3000/api/venue/certifications/${request.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({ decision: 'approved', reason: '専門資格・根拠を確認し認証を付与します。' })
      }),
      { params: Promise.resolve({ requestId: request.id }) }
    );
    expect(approveRes.status).toBe(200);

    // Subsequent comment by certified expert automatically receives isExpertAdvice: true
    const cmtRes = await addCommentPost(
      new Request('http://localhost:3000/api/venue/posts/post-kyushu-001/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: expertCookie },
        body: JSON.stringify({ body: '水辺保全では増水時の退避ルート事前確認が有効です。' })
      }),
      { params: Promise.resolve({ postId: 'post-kyushu-001' }) }
    );
    expect(cmtRes.status).toBe(200);
    const cmtBody = (await cmtRes.json()) as { comment: { isExpertAdvice: boolean } };
    expect(cmtBody.comment.isExpertAdvice).toBe(true);
  });

  it('enforces self-review prohibition when an operator attempts to approve their own certification request', async () => {
    const operatorCookie = await loginAs('demo-acct-operator');

    const selfSub = await submitCertPost(
      new Request('http://localhost:3000/api/venue/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({ kind: 'expert', summary: '自己審査禁止の検証申請' })
      })
    );
    expect(selfSub.status).toBe(200);
    const { request } = (await selfSub.json()) as { request: { id: string } };

    const selfReview = await reviewCertPost(
      new Request(`http://localhost:3000/api/venue/certifications/${request.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({ decision: 'approved', reason: '自分で承認しようとするテスト' })
      }),
      { params: Promise.resolve({ requestId: request.id }) }
    );
    expect(selfReview.status).toBe(403);
    const body = (await selfReview.json()) as { reasonCode: string };
    expect(body.reasonCode).toBe('SELF_REVIEW_PROHIBITED');
  });

  it('enforces AI-primary-before-human-review for seeking-match mediated matching and sends notifications on approval', async () => {
    const citizenCookie = await loginAs('demo-acct-citizen');
    const operatorCookie = await loginAs('demo-acct-operator');

    // 1) Attempting human review before AI primary evaluation must fail with AI_RECOMMENDATION_REQUIRED
    const prematureRes = await mediatedMatchPost(
      new Request('http://localhost:3000/api/venue/operator/mediated-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({
          step: 'human-review',
          citizenActorId: 'sim-kyushu-cit-demo',
          targetOrgActorId: 'sim-kyushu-org-bg-1',
          recommendationId: null,
          decision: 'approved',
          reason: 'AI評価を飛ばした承認試行'
        })
      })
    );
    expect(prematureRes.status).toBe(400);
    expect(((await prematureRes.json()) as { reasonCode: string }).reasonCode).toBe('AI_RECOMMENDATION_REQUIRED');

    // 2) Run AI primary evaluation first (structured data only, externalApiCalled: false)
    const aiRes = await mediatedMatchPost(
      new Request('http://localhost:3000/api/venue/operator/mediated-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({
          step: 'ai-review',
          citizenActorId: 'sim-kyushu-cit-demo',
          targetOrgActorId: 'sim-kyushu-org-bg-1'
        })
      })
    );
    expect(aiRes.status).toBe(200);
    const aiBody = (await aiRes.json()) as {
      ok: boolean;
      assessment: {
        recommendationId: string;
        status: string;
        externalApiCalled: boolean;
        distanceMeters: number;
        matchedTags: string[];
      };
    };
    expect(aiBody.assessment.status).toBe('requires-human-review');
    expect(aiBody.assessment.externalApiCalled).toBe(false);
    expect(aiBody.assessment.distanceMeters).toBeGreaterThan(0);
    expect(aiBody.assessment.matchedTags).toContain('自然観察会');

    // 3) Submit human secondary review referencing that recommendationId
    const humanRes = await mediatedMatchPost(
      new Request('http://localhost:3000/api/venue/operator/mediated-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({
          step: 'human-review',
          citizenActorId: 'sim-kyushu-cit-demo',
          targetOrgActorId: 'sim-kyushu-org-bg-1',
          recommendationId: aiBody.assessment.recommendationId,
          decision: 'approved',
          reason: '距離とタグ一致および初心者受入体制を運営が確認したため承認します。'
        })
      })
    );
    expect(humanRes.status).toBe(200);
    expect(((await humanRes.json()) as { notificationSent: boolean }).notificationSent).toBe(true);

    // Citizen receives mediated matching notification
    const citPoll = await sessionGet(
      new Request('http://localhost:3000/api/venue/session', { headers: { cookie: citizenCookie } })
    );
    const citBody = (await citPoll.json()) as { notifications: { title: string; referenceId: string }[] };
    expect(citBody.notifications.some((n) => n.referenceId === aiBody.assessment.recommendationId)).toBe(true);
  });
});
