import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { toStructuredVenueMatchingInput } from '@satoyama/domain';
import { InMemoryVenueFoundationStore } from '../db/venue-store';
import { POST as loginPost } from '../apps/web/app/api/venue/login/route';
import { GET as sessionGet } from '../apps/web/app/api/venue/session/route';
import { POST as createPost } from '../apps/web/app/api/venue/posts/route';
import { POST as addComment } from '../apps/web/app/api/venue/posts/[postId]/comments/route';
import { POST as endorsePost } from '../apps/web/app/api/venue/posts/[postId]/endorse/route';
import { POST as createConnection } from '../apps/web/app/api/venue/connections/route';
import { POST as updateProfile } from '../apps/web/app/api/venue/profile/route';
import { POST as readNotification } from '../apps/web/app/api/venue/notifications/read/route';
import {
  getActiveVenueFoundationStore,
  setActiveVenueFoundationStoreForTest
} from '../apps/web/lib/venue-runtime';

beforeEach(() => {
  setActiveVenueFoundationStoreForTest(new InMemoryVenueFoundationStore());
});
afterAll(() => {
  setActiveVenueFoundationStoreForTest(null);
});

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

describe('P3 SNS Common Surface, Active Matching, Notifications & Bio Exclusion', () => {
  it('rejects unauthenticated write attempts and restricts public-offer channel to government/operator', async () => {
    const unauth = await createPost(
      new Request('http://localhost:3000/api/venue/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '未ログイン投稿', body: 'テスト', tags: ['竹林整備'] })
      })
    );
    expect(unauth.status).toBe(401);

    const citizenCookie = await loginAs('demo-acct-citizen');
    const forbiddenChannel = await createPost(
      new Request('http://localhost:3000/api/venue/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: citizenCookie },
        body: JSON.stringify({
          channel: 'public-offer',
          title: '市民による公的枠なりすまし',
          body: '拒否されるべき',
          tags: ['地域調整']
        })
      })
    );
    expect(forbiddenChannel.status).toBe(403);
    expect(((await forbiddenChannel.json()) as { reasonCode: string }).reasonCode).toBe('FORBIDDEN_PUBLIC_CHANNEL');

    const govCookie = await loginAs('demo-acct-gov');
    const govPost = await createPost(
      new Request('http://localhost:3000/api/venue/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: govCookie },
        body: JSON.stringify({
          channel: 'public-offer',
          title: '【模擬】自治体からの竹林資材支援案内',
          body: '認証済み市民団体の相談を受け付けます。',
          tags: ['竹林整備', '地域調整']
        })
      })
    );
    expect(govPost.status).toBe(200);
  });

  it('synchronizes posts, endorsements, comments, active connections, and notifications across devices without allowing expert badge spoofing', async () => {
    const citizenCookie = await loginAs('demo-acct-citizen');
    const expertCandidateCookie = await loginAs('demo-acct-expert');

    // Device A (citizen) posts
    const postRes = await createPost(
      new Request('http://localhost:3000/api/venue/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: citizenCookie },
        body: JSON.stringify({
          channel: 'horizontal',
          title: '元岡の竹林整備を一緒にやりませんか？',
          body: '初心者ですが安全に整備する方法を知りたいです。',
          tags: ['竹林整備', '安全管理']
        })
      })
    );
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as { ok: boolean; post: { id: string } };

    // Device B (uncertified expert candidate) endorses, comments (attempting to pass isExpertAdvice: true), and actively connects
    const endorseRes = await endorsePost(
      new Request(`http://localhost:3000/api/venue/posts/${postBody.post.id}/endorse`, {
        method: 'POST',
        headers: { cookie: expertCandidateCookie }
      }),
      { params: Promise.resolve({ postId: postBody.post.id }) }
    );
    expect(endorseRes.status).toBe(200);
    expect(((await endorseRes.json()) as { post: { endorsementCount: number } }).post.endorsementCount).toBe(1);

    const cmtRes = await addComment(
      new Request(`http://localhost:3000/api/venue/posts/${postBody.post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: expertCandidateCookie },
        body: JSON.stringify({ body: '安全講習の確認が大切です！', isExpertAdvice: true })
      }),
      { params: Promise.resolve({ postId: postBody.post.id }) }
    );
    expect(cmtRes.status).toBe(200);
    const cmtBody = (await cmtRes.json()) as { comment: { isExpertAdvice: boolean } };
    // Server must ignore client-supplied isExpertAdvice when expertCertified is false
    expect(cmtBody.comment.isExpertAdvice).toBe(false);

    const connRes = await createConnection(
      new Request('http://localhost:3000/api/venue/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: expertCandidateCookie },
        body: JSON.stringify({
          toActorId: 'sim-kyushu-cit-demo',
          postId: postBody.post.id,
          note: '自己紹介を見て連絡しました！'
        })
      })
    );
    expect(connRes.status).toBe(200);
    const connBody = (await connRes.json()) as { connection: { supportStatus: string } };
    expect(connBody.connection.supportStatus).toBe('unsupported-informal');

    // Device A polls /api/venue/session and sees both social & matching notifications
    const pollRes = await sessionGet(
      new Request('http://localhost:3000/api/venue/session', {
        headers: { cookie: citizenCookie }
      })
    );
    const pollBody = (await pollRes.json()) as {
      notifications: { id: string; category: string; isRead: boolean }[];
    };
    const matchingNotif = pollBody.notifications.find((n) => n.category === 'matching');
    const socialNotif = pollBody.notifications.find((n) => n.category === 'social');
    expect(matchingNotif).toBeDefined();
    expect(socialNotif).toBeDefined();
    expect(matchingNotif!.isRead).toBe(false);

    // Device A marks the matching notification as read
    const readRes = await readNotification(
      new Request('http://localhost:3000/api/venue/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: citizenCookie },
        body: JSON.stringify({ notificationId: matchingNotif!.id })
      })
    );
    expect(readRes.status).toBe(200);
    expect(((await readRes.json()) as { ok: boolean }).ok).toBe(true);
  });

  it('updates own bio and seekingMatch via API while keeping bio excluded from structured AI/matching inputs', async () => {
    const citizenCookie = await loginAs('demo-acct-citizen');
    const updatedBio = '週末に糸島・元岡の竹林観察に参加したいです（自己紹介更新テスト）';

    const res = await updateProfile(
      new Request('http://localhost:3000/api/venue/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: citizenCookie },
        body: JSON.stringify({ bio: updatedBio, seekingMatch: false })
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { publicProfile: { bio: string; seekingMatch: boolean } };
    expect(body.publicProfile.bio).toBe(updatedBio);
    expect(body.publicProfile.seekingMatch).toBe(false);

    // Verify structured matching projection excludes free-text bio completely
    const resolved = await getActiveVenueFoundationStore().resolveSessionByToken(
      decodeURIComponent(citizenCookie.split('=')[1])
    );
    const matchingInput = toStructuredVenueMatchingInput(resolved.profile!);
    expect(matchingInput).not.toHaveProperty('bio');
    expect(matchingInput.willingness).toBe('open');
  });
});
