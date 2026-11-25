import { NextResponse } from 'next/server';
import { getActiveVenueFoundationStore } from '../../../../../../lib/venue-runtime';
import { extractSessionTokenFromCookieHeader } from '../../../../../../lib/venue-session';

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
      { ok: false, reasonCode: 'UNAUTHENTICATED', message: '賛同にはログインが必要です。' },
      { status: 401 }
    );
  }

  const { postId } = await context.params;
  try {
    const post = await store.endorseSocialPost(postId);
    return NextResponse.json({ ok: true, post });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reasonCode: 'POST_NOT_FOUND', message: err instanceof Error ? err.message : '投稿が見つかりません。' },
      { status: 404 }
    );
  }
}
