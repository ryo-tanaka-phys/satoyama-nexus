import { describe, expect, it } from 'vitest';
import { POST as loginPost } from '../apps/web/app/api/venue/login/route';
import { POST as registerPost } from '../apps/web/app/api/venue/register/route';
import { GET as sessionGet } from '../apps/web/app/api/venue/session/route';
import { POST as submitCertPost } from '../apps/web/app/api/venue/certifications/route';
import { POST as reviewCertPost } from '../apps/web/app/api/venue/certifications/[requestId]/review/route';
import { POST as orgCalendarPost } from '../apps/web/app/api/venue/org/calendar/route';
import { POST as orgMembersPost } from '../apps/web/app/api/venue/org/members/route';
import { GET as orgChatGet, POST as orgChatPost } from '../apps/web/app/api/venue/org/chat/route';
import { POST as orgReportsPost } from '../apps/web/app/api/venue/org/reports/route';
import { POST as createPost } from '../apps/web/app/api/venue/posts/route';
import { POST as addCommentPost } from '../apps/web/app/api/venue/posts/[postId]/comments/route';

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

describe('P5 Certified Organization Workspace (Calendar, Dummy Members, Private Chat, Simplified Reports)', () => {
  it('blocks uncertified organizations and outside citizens from all org-only APIs, then unlocks cleanly after operator certification', async () => {
    // Register a fresh uncertified organization so this test is completely self-contained
    const regRes = await registerPost(
      new Request('http://localhost:3000/api/venue/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: '【模擬】桑原竹林保全テスト会',
          roleTrack: 'organization',
          gridCellId: 'grid-r1-c3',
          interestTags: ['竹林整備', '安全管理'],
          strengthTags: ['竹林整備'],
          bio: '桑原エリアで竹林整備を行う新設模擬団体です'
        })
      })
    );
    expect(regRes.status).toBe(200);
    const orgCookie = regRes.headers.get('set-cookie')!.split(';')[0];

    const citizenCookie = await loginAs('demo-acct-citizen');
    const expertCookie = await loginAs('demo-acct-expert');
    const operatorCookie = await loginAs('demo-acct-operator');

    // 1) Before certification: all org-only endpoints return 403 ORGANIZATION_NOT_CERTIFIED
    const deniedCal = await orgCalendarPost(
      new Request('http://localhost:3000/api/venue/org/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({ title: '未認証テスト', scheduledDate: '2026-12-10' })
      })
    );
    expect(deniedCal.status).toBe(403);
    expect(((await deniedCal.json()) as { reasonCode: string }).reasonCode).toBe('ORGANIZATION_NOT_CERTIFIED');

    const deniedChat = await orgChatPost(
      new Request('http://localhost:3000/api/venue/org/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({ body: '未認証チャット試行' })
      })
    );
    expect(deniedChat.status).toBe(403);

    const deniedReport = await orgReportsPost(
      new Request('http://localhost:3000/api/venue/org/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({ title: '未認証レポート試行' })
      })
    );
    expect(deniedReport.status).toBe(403);

    // 2) Operator certifies this organization AND certifies the expert candidate
    const orgCertSub = await submitCertPost(
      new Request('http://localhost:3000/api/venue/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({ kind: 'organization', summary: '団体認証申請' })
      })
    );
    const orgReqId = ((await orgCertSub.json()) as { request: { id: string } }).request.id;
    const orgApprove = await reviewCertPost(
      new Request(`http://localhost:3000/api/venue/certifications/${orgReqId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({ decision: 'approved', reason: '団体認証承認' })
      }),
      { params: Promise.resolve({ requestId: orgReqId }) }
    );
    expect(orgApprove.status).toBe(200);

    const expCertSub = await submitCertPost(
      new Request('http://localhost:3000/api/venue/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: expertCookie },
        body: JSON.stringify({ kind: 'expert', summary: '安全管理の専門家認証申請' })
      })
    );
    const expReqId = ((await expCertSub.json()) as { request: { id: string } }).request.id;
    await reviewCertPost(
      new Request(`http://localhost:3000/api/venue/certifications/${expReqId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({ decision: 'approved', reason: '専門家資格認証承認' })
      }),
      { params: Promise.resolve({ requestId: expReqId }) }
    );

    // 3) After certification: Calendar -> complete -> Dummy Member -> Private Chat -> Post + Expert Advice -> Report
    const calRes = await orgCalendarPost(
      new Request('http://localhost:3000/api/venue/org/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({
          title: '桑原竹林整備 第1回',
          scheduledDate: '2026-12-06',
          gridCellId: 'grid-r1-c3',
          participantCount: 8,
          summary: '初回安全確認および間伐作業'
        })
      })
    );
    expect(calRes.status).toBe(200);
    const calId = ((await calRes.json()) as { event: { id: string } }).event.id;

    const completeRes = await orgCalendarPost(
      new Request('http://localhost:3000/api/venue/org/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({ action: 'toggle-status', eventId: calId, status: 'completed' })
      })
    );
    expect(completeRes.status).toBe(200);
    expect(((await completeRes.json()) as { event: { status: string } }).event.status).toBe('completed');

    const memRes = await orgMembersPost(
      new Request('http://localhost:3000/api/venue/org/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({ displayName: '桑原 太郎', roleNote: '安全係' })
      })
    );
    expect(memRes.status).toBe(200);
    const memBody = (await memRes.json()) as { actor: { id: string }; membership: { isDummy: boolean } };
    expect(memBody.membership.isDummy).toBe(true);

    // Private org chat
    const secretText = '団体内チャット：ノコギリ5本は倉庫Bに保管済み';
    const chatPostRes = await orgChatPost(
      new Request('http://localhost:3000/api/venue/org/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({ body: secretText })
      })
    );
    expect(chatPostRes.status).toBe(200);

    // Outside citizen MUST NOT be able to read org chat via dedicated endpoint OR session polling
    const citizenChatGet = await orgChatGet(
      new Request('http://localhost:3000/api/venue/org/chat', { headers: { cookie: citizenCookie } })
    );
    expect(citizenChatGet.status).toBe(403);

    const citizenSession = await sessionGet(
      new Request('http://localhost:3000/api/venue/session', { headers: { cookie: citizenCookie } })
    );
    const citizenSessionBody = (await citizenSession.json()) as {
      orgChatMessages: unknown[];
      snapshot: { demoAccounts: { actorId: string }[] };
    };
    expect(citizenSessionBody.orgChatMessages).toEqual([]);
    // Dummy member must NOT have a login demoAccount
    expect(citizenSessionBody.snapshot.demoAccounts.some((a) => a.actorId === memBody.actor.id)).toBe(false);

    // Org posts on SNS feed and receives certified expert advice
    const postRes = await createPost(
      new Request('http://localhost:3000/api/venue/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({
          channel: 'horizontal',
          title: '桑原竹林整備の報告と安全相談',
          body: '初回整備を実施しました。次回に向けた安全面の助言を募集します。',
          tags: ['竹林整備', '安全管理']
        })
      })
    );
    const postId = ((await postRes.json()) as { post: { id: string } }).post.id;

    await addCommentPost(
      new Request(`http://localhost:3000/api/venue/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: expertCookie },
        body: JSON.stringify({ body: '斜面作業時はヘルメットと2名以上のバディ制を推奨します。' })
      }),
      { params: Promise.resolve({ postId }) }
    );

    // Generate simplified activity report aggregating calendar + post + expert advice
    const repRes = await orgReportsPost(
      new Request('http://localhost:3000/api/venue/org/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: orgCookie },
        body: JSON.stringify({
          title: '桑原竹林保全テスト会 活動実績レポート',
          periodLabel: '2026年12月',
          additionalNote: '資材保管場所の支援を相談したい'
        })
      })
    );
    expect(repRes.status).toBe(200);
    const repBody = (await repRes.json()) as {
      report: {
        calendarEventCount: number;
        socialLogCount: number;
        expertAdviceCount: number;
        summaryText: string;
      };
    };
    expect(repBody.report.calendarEventCount).toBe(1);
    expect(repBody.report.socialLogCount).toBe(1);
    expect(repBody.report.expertAdviceCount).toBe(1);
    expect(repBody.report.summaryText).toContain('延べ参加8名');
  });
});
