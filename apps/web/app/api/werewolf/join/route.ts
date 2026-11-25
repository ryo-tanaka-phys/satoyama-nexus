import { NextResponse } from 'next/server';
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
      { ok: false, reasonCode: 'SPOOFED_AUTH_FIELD', message: `不正な権限指定 (${spoofedKey}) は拒否されました。` },
      { status: 400 }
    );
  }

  const roomCode = typeof body.roomCode === 'string' ? body.roomCode.trim() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!roomCode || !displayName) {
    return NextResponse.json(
      { ok: false, reasonCode: 'ROOM_AND_NAME_REQUIRED', message: 'ルームコードとニックネームの両方を入力してください。' },
      { status: 400 }
    );
  }

  try {
    const store = getActiveVenueFoundationStore();
    const joined = await store.joinWerewolfRoom({ roomCode, displayName });
    const isSecure = new URL(request.url).protocol === 'https:';
    const res = NextResponse.json({
      ok: true,
      room: joined.room,
      account: joined.account,
      assignment: joined.assignment,
      lateJoined: joined.lateJoined
    });
    res.headers.set('Set-Cookie', buildSessionSetCookieHeader(joined.rawToken, { secure: isSecure }));
    return res;
  } catch (err) {
    return NextResponse.json(
      { ok: false, reasonCode: 'JOIN_FAILED', message: err instanceof Error ? err.message : 'ルーム参加に失敗しました。' },
      { status: 400 }
    );
  }
}
