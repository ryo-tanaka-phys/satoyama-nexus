import { describe, expect, it } from 'vitest';
import { formatPublicApprovalView } from '@satoyama/domain';
import { POST as loginPost } from '../apps/web/app/api/venue/login/route';
import { POST as registerPost } from '../apps/web/app/api/venue/register/route';
import { GET as sessionGet } from '../apps/web/app/api/venue/session/route';
import { POST as submitCertPost } from '../apps/web/app/api/venue/certifications/route';
import { POST as reviewCertPost } from '../apps/web/app/api/venue/certifications/[requestId]/review/route';
import { POST as createPost } from '../apps/web/app/api/venue/posts/route';
import { POST as addCommentPost } from '../apps/web/app/api/venue/posts/[postId]/comments/route';
import { POST as orgReportsPost } from '../apps/web/app/api/venue/org/reports/route';
import { POST as publicInteractionPost } from '../apps/web/app/api/venue/public-interactions/route';
import { POST as respondInteractionPost } from '../apps/web/app/api/venue/public-interactions/[interactionId]/respond/route';
import { POST as ackCorporateOfferPost } from '../apps/web/app/api/venue/corporate-offers/acknowledge/route';

async function loginAs(accountId: string): Promise<string> {
  const res = await loginPost(
    new Request('http://localhost:3000/api/venue/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId })
    })
  );
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie')!.split(';')[0];
}

describe('P6 Vertical Municipality Interactions & Separated Corporate Auto-Support Offers', () => {
  it('auto-dispatches all 3 separated corporate plans on org milestones, enforces government-only decisions, and supports direct government offers', async () => {
    const regOrg = await registerPost(
      new Request('http://localhost:3000/api/venue/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: '【模擬】今津里山アクション会',
          roleTrack: 'organization',
          gridCellId: 'grid-r0-c3',
          interestTags: ['竹林整備', '歩道整備'],
          strengthTags: ['竹林整備'],
          bio: '今津エリアで竹林整備に取り組む団体です'
        })
      })
    );
    expect(regOrg.status).toBe(200);
    const orgCookie = regOrg.headers.get('set-cookie')!.split(';')[0];
    const orgBody = (await regOrg.json()) as { account: { actorId: string } };
    const orgActorId = orgBody.account.actorId;

    const citizenCookie = await loginAs('demo-acct-citizen');
    const expertCookie = await loginAs('demo-acct-expert');
    const govCookie = await loginAs('demo-acct-gov');
    const operatorCookie = await loginAs('demo-acct-operator');

    // Certify organization -> should automatically trigger Corporate Plan 1 (materials)
    const orgSub = await submitCertPost(
      new Request('http://localhost:3000/api/venue/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({ kind: 'organization', summary: '団体認証申請' })
      })
    );
    const orgReqId = ((await orgSub.json()) as { request: { id: string } }).request.id;
    await reviewCertPost(
      new Request(`http://localhost:3000/api/venue/certifications/${orgReqId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({ decision: 'approved', reason: '団体認証を承認します。' })
      }),
      { params: Promise.resolve({ requestId: orgReqId }) }
    );

    // Certify expert -> org posts -> expert comments advice -> should auto-trigger Corporate Plan 3 (safety-equipment)
    const expSub = await submitCertPost(
      new Request('http://localhost:3000/api/venue/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: expertCookie },
        body: JSON.stringify({ kind: 'expert', summary: '専門家資格認証申請' })
      })
    );
    const expReqId = ((await expSub.json()) as { request: { id: string } }).request.id;
    await reviewCertPost(
      new Request(`http://localhost:3000/api/venue/certifications/${expReqId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({ decision: 'approved', reason: '資格認証を承認します。' })
      }),
      { params: Promise.resolve({ requestId: expReqId }) }
    );

    const postRes = await createPost(
      new Request('http://localhost:3000/api/venue/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({
          channel: 'horizontal',
          title: '今津の竹林整備と安全確認',
          body: '作業手順について専門家の助言を募集します。',
          tags: ['竹林整備', '安全管理']
        })
      })
    );
    const postId = ((await postRes.json()) as { post: { id: string } }).post.id;

    await addCommentPost(
      new Request(`http://localhost:3000/api/venue/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: expertCookie },
        body: JSON.stringify({ body: '伐倒方向の確認と安全距離の確保を徹底してください。' })
      }),
      { params: Promise.resolve({ postId }) }
    );

    // Generate simplified activity report -> should auto-trigger Corporate Plan 2 (funding)
    const repRes = await orgReportsPost(
      new Request('http://localhost:3000/api/venue/org/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({ title: '今津里山 活動実績レポート', periodLabel: '2026年12月' })
      })
    );
    const reportId = ((await repRes.json()) as { report: { id: string } }).report.id;

    // Org submits support-request with report attached to Municipality
    const petRes = await publicInteractionPost(
      new Request('http://localhost:3000/api/venue/public-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({
          direction: 'to-government',
          kind: 'support-request',
          toActorId: 'sim-kyushu-gov-demo',
          reportId,
          title: '公有林での資材保管・安全講習支援の相談',
          body: '簡易レポートを添付しました。資材保管スペースのご相談をお願いします。'
        })
      })
    );
    expect(petRes.status).toBe(200);
    const interactionId = ((await petRes.json()) as { interaction: { id: string } }).interaction.id;

    // Verify ALL 3 corporate offers arrived, deduplicated, and simulation.actor has NO corporate rows
    const orgPoll = await sessionGet(
      new Request('http://localhost:3000/api/venue/session', { headers: { cookie: orgCookie } })
    );
    const orgPollBody = (await orgPoll.json()) as {
      notifications: { category: string }[];
      snapshot: {
        actors: { id: string; kind: string }[];
        corporateOffers: { id: string; planId: string; targetActorId: string; status: string }[];
      };
    };
    const offersForOrg = orgPollBody.snapshot.corporateOffers.filter((o) => o.targetActorId === orgActorId);
    expect(offersForOrg.map((o) => o.planId).sort()).toEqual([
      'corp-plan-funding',
      'corp-plan-materials',
      'corp-plan-safety'
    ]);
    expect(orgPollBody.notifications.filter((n) => n.category === 'corporate-offer')).toHaveLength(3);
    expect(orgPollBody.snapshot.actors.every((a) => !a.id.startsWith('corp-'))).toBe(true);

    // Org acknowledges first corporate offer
    const ackRes = await ackCorporateOfferPost(
      new Request('http://localhost:3000/api/venue/corporate-offers/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({ offerId: offersForOrg[0].id })
      })
    );
    expect(ackRes.status).toBe(200);

    // Citizen MUST NOT be allowed to decide a petition (403) or send a government offer (403)
    const citizenDecide = await respondInteractionPost(
      new Request(`http://localhost:3000/api/venue/public-interactions/${interactionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: citizenCookie },
        body: JSON.stringify({ nextStatus: 'supported', reason: '市民による不正承認試行' })
      }),
      { params: Promise.resolve({ interactionId }) }
    );
    expect(citizenDecide.status).toBe(403);

    const citizenOffer = await publicInteractionPost(
      new Request('http://localhost:3000/api/venue/public-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: citizenCookie },
        body: JSON.stringify({
          direction: 'from-government',
          kind: 'government-offer',
          toActorId: orgActorId,
          title: '不正オファー',
          body: '市民が自治体オファーを装う試行'
        })
      })
    );
    expect(citizenOffer.status).toBe(403);

    // Municipality reviews & supports the petition -> process history recorded & visibility mode verified
    const govReview1 = await respondInteractionPost(
      new Request(`http://localhost:3000/api/venue/public-interactions/${interactionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: govCookie },
        body: JSON.stringify({ nextStatus: 'under-review', reason: '所管課にて簡易レポートを確認開始しました。' })
      }),
      { params: Promise.resolve({ interactionId }) }
    );
    expect(govReview1.status).toBe(200);

    const govReview2 = await respondInteractionPost(
      new Request(`http://localhost:3000/api/venue/public-interactions/${interactionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: govCookie },
        body: JSON.stringify({ nextStatus: 'supported', reason: '実績と専門家助言を確認し、支援を決定します。' })
      }),
      { params: Promise.resolve({ interactionId }) }
    );
    expect(govReview2.status).toBe(200);

    const afterGovPoll = await sessionGet(
      new Request('http://localhost:3000/api/venue/session', { headers: { cookie: orgCookie } })
    );
    const afterGovBody = (await afterGovPoll.json()) as {
      snapshot: {
        publicInteractionEvents: {
          id: string;
          interactionId: string;
          actorAccountId: string;
          fromStatus: string | null;
          toStatus: string;
          reason: string;
          recordedAt: string;
        }[];
      };
    };
    const steps = afterGovBody.snapshot.publicInteractionEvents.filter((e) => e.interactionId === interactionId);
    expect(steps.map((s) => s.toStatus)).toEqual(['submitted', 'under-review', 'supported']);

    const fullView = formatPublicApprovalView({ status: 'supported', decidedAt: steps[2].recordedAt, steps }, 'full-process');
    expect(fullView.processSteps).toHaveLength(3);
    const outcomeView = formatPublicApprovalView({ status: 'supported', decidedAt: steps[2].recordedAt, steps }, 'outcome-only');
    expect(outcomeView.processSteps).toHaveLength(0);

    // Municipality sends direct offer to a citizen -> citizen accepts
    const govOfferRes = await publicInteractionPost(
      new Request('http://localhost:3000/api/venue/public-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: govCookie },
        body: JSON.stringify({
          direction: 'from-government',
          kind: 'government-offer',
          toActorId: 'sim-kyushu-cit-demo',
          title: '市民向け・里山自然観察会サポーターのご案内',
          body: '周船寺周辺の観察会ボランティアにご参加いただけませんか？'
        })
      })
    );
    expect(govOfferRes.status).toBe(200);
    const offerId = ((await govOfferRes.json()) as { interaction: { id: string } }).interaction.id;

    const citizenAccept = await respondInteractionPost(
      new Request(`http://localhost:3000/api/venue/public-interactions/${offerId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: citizenCookie },
        body: JSON.stringify({ nextStatus: 'accepted', reason: 'ぜひ参加希望します！' })
      }),
      { params: Promise.resolve({ interactionId: offerId }) }
    );
    expect(citizenAccept.status).toBe(200);
    expect(((await citizenAccept.json()) as { interaction: { status: string } }).interaction.status).toBe('accepted');
  });
});
