import { NextResponse } from 'next/server';
import { getActiveVenueFoundationStore } from '../../../../lib/venue-runtime';
import {
  buildClearSessionCookieHeader,
  extractSessionTokenFromCookieHeader
} from '../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const store = getActiveVenueFoundationStore();
  const rawToken = extractSessionTokenFromCookieHeader(request.headers.get('cookie'));
  await store.revokeSessionByToken(rawToken);
  const isSecure = new URL(request.url).protocol === 'https:';
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', buildClearSessionCookieHeader({ secure: isSecure }));
  return res;
}
