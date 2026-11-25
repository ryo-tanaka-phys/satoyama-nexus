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
      { ok: false, reasonCode: 'UNAUTHENTICATED', message: '投稿にはログインが必要です。' },
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

  const requestedChannel = typeof body.channel === 'string' ? body.channel : 'horizontal';
  let channel: 'horizontal' | 'public-offer' | 'activity-log' = 'horizontal';
  if (requestedChannel === 'public-offer') {
    if (resolved.account.roleTrack !== 'government' && resolved.account.roleTrack !== 'operator') {
      return NextResponse.json(
        {
          ok: false,
          reasonCode: 'FORBIDDEN_PUBLIC_CHANNEL',
          message: '公的オファー枠への投稿は自治体・運営アカウントのみ可能です。'
        },
        { status: 403 }
      );
    }
    channel = 'public-offer';
  } else if (requestedChannel === 'activity-log') {
    channel = 'activity-log';
  }

  const title = typeof body.title === 'string' ? body.title : '';
  const content = typeof body.body === 'string' ? body.body : '';
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string') : [];
  const gridCellId = typeof body.gridCellId === 'string' ? body.gridCellId : null;

  try {
    const post = await store.createSocialPost({
      authorActorId: resolved.account.actorId,
      channel,
      title,
      body: content,
      tags,
      gridCellId
    });
    return NextResponse.json({ ok: true, post });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reasonCode: 'INVALID_POST', message: err instanceof Error ? err.message : '投稿に失敗しました。' },
      { status: 400 }
    );
  }
}
