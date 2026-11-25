import { NextResponse } from 'next/server';
import { getActiveVenueFoundationStore } from '../../../../../lib/venue-runtime';
import { extractSessionTokenFromCookieHeader } from '../../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const store = getActiveVenueFoundationStore();
  const rawToken = extractSessionTokenFromCookieHeader(request.headers.get('cookie'));
  const resolved = await store.resolveSessionByToken(rawToken);
  if (!resolved.authenticated || !resolved.account) {
    return NextResponse.json(
      { ok: false, reasonCode: 'UNAUTHENTICATED', message: '通知の既読化にはログインが必要です。' },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reasonCode: 'INVALID_JSON', message: 'リクエスト形式が不正です。' }, { status: 400 });
  }

  const notificationId = typeof body.notificationId === 'string' ? body.notificationId.trim() : '';
  if (!notificationId) {
    return NextResponse.json({ ok: false, reasonCode: 'NOTIFICATION_ID_REQUIRED', message: '通知IDを指定してください。' }, { status: 400 });
  }

  const marked = await store.markNotificationRead(notificationId, resolved.account.actorId);
  return NextResponse.json({ ok: marked });
}
