import { describe, expect, it } from 'vitest';
import { POST as registerPost } from '../apps/web/app/api/venue/register/route';
import { POST as loginPost } from '../apps/web/app/api/venue/login/route';
import { GET as sessionGet } from '../apps/web/app/api/venue/session/route';
import { POST as logoutPost } from '../apps/web/app/api/venue/logout/route';

function extractCookiePair(setCookie: string | null): string {
  expect(setCookie).toBeTruthy();
  return setCookie!.split(';')[0];
}

describe('P2 Entry, Registration & Multi-Device HttpOnly Session API', () => {
  it('registers a new citizen via 4x4 Kyushu grid, sets HttpOnly cookie, and strips private demographics', async () => {
    const req = new Request('http://localhost:3000/api/venue/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: '元岡 テスト学生',
        roleTrack: 'citizen',
        gridCellId: 'grid-r1-c2',
        interestTags: ['竹林整備', '記録/GIS'],
        strengthTags: ['広報'],
        bio: '能動マッチング用の自己紹介です',
        ageInternal: 21,
        genderInternal: '非公開サンプル',
        seekingMatch: true
      })
    });

    const res = await registerPost(req);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    const body = (await res.json()) as {
      ok: boolean;
      account: { id: string; displayName: string; roleTrack: string };
      publicProfile: Record<string, unknown>;
    };
    expect(body.ok).toBe(true);
    expect(body.account.displayName).toBe('元岡 テスト学生');
    expect(body.publicProfile.gridLabel).toBe('九大伊都キャンパス東・元岡');
    expect(body.publicProfile).not.toHaveProperty('ageInternal');
    expect(body.publicProfile).not.toHaveProperty('genderInternal');

    // Subsequent GET /api/venue/session with the cookie restores the server-verified session
    const cookiePair = extractCookiePair(setCookie);
    const sessionRes = await sessionGet(
      new Request('http://localhost:3000/api/venue/session', {
        headers: { cookie: cookiePair }
      })
    );
    const sessionBody = (await sessionRes.json()) as {
      authenticated: boolean;
      account: { id: string };
      publicProfile: Record<string, unknown>;
      snapshot: { publicProfiles: Record<string, unknown>[] };
    };
    expect(sessionBody.authenticated).toBe(true);
    expect(sessionBody.account.id).toBe(body.account.id);
    expect(sessionBody.publicProfile).not.toHaveProperty('ageInternal');
    expect(sessionBody.publicProfile).not.toHaveProperty('genderInternal');
    // No profile in the shared snapshot leaks age/gender
    for (const p of sessionBody.snapshot.publicProfiles) {
      expect(p).not.toHaveProperty('ageInternal');
      expect(p).not.toHaveProperty('genderInternal');
    }
  });

  it('rejects client-supplied spoofed authority keys and unknown tags', async () => {
    const spoofRes = await registerPost(
      new Request('http://localhost:3000/api/venue/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'なりすまし試行',
          roleTrack: 'citizen',
          gridCellId: 'grid-r1-c1',
          role: 'operator',
          interestTags: ['竹林整備'],
          strengthTags: []
        })
      })
    );
    expect(spoofRes.status).toBe(400);
    const spoofBody = (await spoofRes.json()) as { reasonCode: string };
    expect(spoofBody.reasonCode).toBe('SPOOFED_AUTH_FIELD');

    const badTagRes = await registerPost(
      new Request('http://localhost:3000/api/venue/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: '不正タグ試行',
          roleTrack: 'citizen',
          gridCellId: 'grid-r1-c1',
          interestTags: ['未許可の自由タグ'],
          strengthTags: []
        })
      })
    );
    expect(badTagRes.status).toBe(400);
  });

  it('supports 5 concurrent independent device logins and revokes sessions cleanly on logout', async () => {
    const demoIds = [
      'demo-acct-citizen',
      'demo-acct-expert',
      'demo-acct-org',
      'demo-acct-gov',
      'demo-acct-operator'
    ];

    const deviceCookies: { accountId: string; cookie: string }[] = [];
    for (const accountId of demoIds) {
      const loginRes = await loginPost(
        new Request('http://localhost:3000/api/venue/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId })
        })
      );
      expect(loginRes.status).toBe(200);
      deviceCookies.push({ accountId, cookie: extractCookiePair(loginRes.headers.get('set-cookie')) });
    }

    // All 5 devices resolve to their own distinct accounts simultaneously
    for (const d of deviceCookies) {
      const res = await sessionGet(
        new Request('http://localhost:3000/api/venue/session', {
          headers: { cookie: d.cookie }
        })
      );
      const body = (await res.json()) as { authenticated: boolean; account: { id: string } };
      expect(body.authenticated).toBe(true);
      expect(body.account.id).toBe(d.accountId);
    }

    // Logging out device 0 revokes ONLY device 0
    const logoutRes = await logoutPost(
      new Request('http://localhost:3000/api/venue/logout', {
        method: 'POST',
        headers: { cookie: deviceCookies[0].cookie }
      })
    );
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('set-cookie')).toContain('Max-Age=0');

    const afterLogout0 = await sessionGet(
      new Request('http://localhost:3000/api/venue/session', {
        headers: { cookie: deviceCookies[0].cookie }
      })
    );
    expect(((await afterLogout0.json()) as { authenticated: boolean }).authenticated).toBe(false);

    const stillLoggedIn4 = await sessionGet(
      new Request('http://localhost:3000/api/venue/session', {
        headers: { cookie: deviceCookies[4].cookie }
      })
    );
    expect(((await stillLoggedIn4.json()) as { authenticated: boolean }).authenticated).toBe(true);
  });
});
