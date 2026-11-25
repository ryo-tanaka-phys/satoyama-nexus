import { NextResponse } from 'next/server';
import { toPublicVenueProfile } from '@satoyama/domain';
import { getActiveVenueFoundationStore } from '../../../../lib/venue-runtime';
import {
  buildSessionSetCookieHeader,
  findSpoofedClientAuthKey
} from '../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reasonCode: 'INVALID_JSON', message: 'リクエスト形式が不正です。' }, { status: 400 });
  }

  const spoofedKey = findSpoofedClientAuthKey(body);
  if (spoofedKey) {
    return NextResponse.json(
      {
        ok: false,
        reasonCode: 'SPOOFED_AUTH_FIELD',
        message: `クライアント指定の権限項目 (${spoofedKey}) は受け付けられません。`
      },
      { status: 400 }
    );
  }

  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
  if (!accountId) {
    return NextResponse.json(
      { ok: false, reasonCode: 'ACCOUNT_ID_REQUIRED', message: 'ログインするアカウントを選択してください。' },
      { status: 400 }
    );
  }

  try {
    const store = getActiveVenueFoundationStore();
    const created = await store.createSessionForAccount(accountId, { mode: 'standard' });
    const resolved = await store.resolveSessionByToken(created.rawToken);
    const isSecure = new URL(request.url).protocol === 'https:';
    const res = NextResponse.json({
      ok: true,
      account: created.account,
      publicProfile: resolved.profile ? toPublicVenueProfile(resolved.profile) : null
    });
    res.headers.set('Set-Cookie', buildSessionSetCookieHeader(created.rawToken, { secure: isSecure }));
    return res;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reasonCode: 'LOGIN_FAILED',
        message: err instanceof Error ? err.message : 'ログインに失敗しました。'
      },
      { status: 400 }
    );
  }
}
