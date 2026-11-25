import { NextResponse } from 'next/server';
import { getActiveVenueFoundationStore } from '../../../../../../lib/venue-runtime';
import {
  extractSessionTokenFromCookieHeader,
  findSpoofedClientAuthKey
} from '../../../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> }
) {
  const store = getActiveVenueFoundationStore();
  const rawToken = extractSessionTokenFromCookieHeader(request.headers.get('cookie'));
  const resolved = await store.resolveSessionByToken(rawToken);
  if (!resolved.authenticated || !resolved.account) {
    return NextResponse.json(
      { ok: false, reasonCode: 'UNAUTHENTICATED', message: 'コメント投稿にはログインが必要です。' },
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

  const { postId } = await context.params;
  const commentBody = typeof body.body === 'string' ? body.body : '';

  try {
    // Note: any client-supplied isExpertAdvice is deliberately ignored; server checks profile.expertCertified.
    const comment = await store.addSocialComment({
      postId,
      authorActorId: resolved.account.actorId,
      body: commentBody
    });
    return NextResponse.json({ ok: true, comment });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reasonCode: 'INVALID_COMMENT', message: err instanceof Error ? err.message : 'コメントに失敗しました。' },
      { status: 400 }
    );
  }
}
