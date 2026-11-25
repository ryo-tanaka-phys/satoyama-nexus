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
      { ok: false, reasonCode: 'UNAUTHENTICATED', message: 'ルーム操作には運営アカウントのログインが必要です。' },
      { status: 401 }
    );
  }
  if (resolved.account.roleTrack !== 'operator') {
    return NextResponse.json(
      { ok: false, reasonCode: 'FORBIDDEN_OPERATOR_ONLY', message: '人狼モードのルーム管理・抽選は運営（据え置き）のみ実行できます。' },
      { status: 403 }
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

  const action = typeof body.action === 'string' ? body.action : '';

  try {
    if (action === 'create') {
      const room = await store.createWerewolfRoom(resolved.account.id);
      return NextResponse.json({ ok: true, room });
    }
    if (action === 'kick') {
      const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
      const targetAccountId = typeof body.targetAccountId === 'string' ? body.targetAccountId.trim() : '';
      const kicked = await store.kickWerewolfParticipant(roomId, targetAccountId);
      return NextResponse.json({ ok: kicked });
    }
    if (action === 'assign') {
      const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
      const result = await store.assignWerewolfRoomRoles({
        roomId,
        operatorAccountId: resolved.account.id
      });
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === 'close') {
      const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
      const result = await store.closeWerewolfRoom(roomId, resolved.account.id);
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json(
      { ok: false, reasonCode: 'UNKNOWN_ACTION', message: 'action (create / kick / assign / close) を指定してください。' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, reasonCode: 'WEREWOLF_ACTION_FAILED', message: err instanceof Error ? err.message : '操作に失敗しました。' },
      { status: 400 }
    );
  }
}
