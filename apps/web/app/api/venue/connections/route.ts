import { NextResponse } from 'next/server';
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
      { ok: false, reasonCode: 'UNAUTHENTICATED', message: '能動マッチング接続にはログインが必要です。' },
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

  const toActorId = typeof body.toActorId === 'string' ? body.toActorId.trim() : '';
  if (!toActorId) {
    return NextResponse.json(
      { ok: false, reasonCode: 'TARGET_REQUIRED', message: '接続相手のアカウントを指定してください。' },
      { status: 400 }
    );
  }

  try {
    const connection = await store.createActiveConnection({
      fromActorId: resolved.account.actorId,
      toActorId,
      postId: typeof body.postId === 'string' ? body.postId : null,
      note: typeof body.note === 'string' ? body.note : undefined
    });
    return NextResponse.json({ ok: true, connection });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reasonCode: 'CONNECTION_FAILED', message: err instanceof Error ? err.message : '接続に失敗しました。' },
      { status: 400 }
    );
  }
}
