import { NextResponse } from 'next/server';
import { toPublicVenueProfile } from '@satoyama/domain';
import { getActiveVenueFoundationStore } from '../../../../lib/venue-runtime';
import {
  extractSessionTokenFromCookieHeader,
  findSpoofedClientAuthKey
} from '../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const store = getActiveVenueFoundationStore();
  const rawToken = extractSessionTokenFromCookieHeader(request.headers.get('cookie'));
  const resolved = await store.resolveSessionByToken(rawToken);
  if (!resolved.authenticated || !resolved.account) {
    return NextResponse.json(
      { ok: false, reasonCode: 'UNAUTHENTICATED', message: 'プロフィール更新にはログインが必要です。' },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reasonCode: 'INVALID_JSON', message: 'リクエスト形式が不正です。' }, { status: 400 });
  }

  const spoofedKey = findSpoofedClientAuthKey(body);
  if (spoofedKey) {
    return NextResponse.json(
      { ok: false, reasonCode: 'SPOOFED_AUTH_FIELD', message: `不正な権限指定 (${spoofedKey}) は拒否されました。` },
      { status: 400 }
    );
  }

  try {
    const updated = await store.updateOwnProfile({
      actorId: resolved.account.actorId,
      bio: typeof body.bio === 'string' ? body.bio : undefined,
      seekingMatch: typeof body.seekingMatch === 'boolean' ? body.seekingMatch : undefined
    });
    return NextResponse.json({ ok: true, publicProfile: toPublicVenueProfile(updated) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reasonCode: 'UPDATE_FAILED', message: err instanceof Error ? err.message : '更新に失敗しました。' },
      { status: 400 }
    );
  }
}
