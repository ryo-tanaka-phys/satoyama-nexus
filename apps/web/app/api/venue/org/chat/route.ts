import { NextResponse } from 'next/server';
import { requireCertifiedOrganizationSession } from '../../../../../lib/venue-org-gate';
import { findSpoofedClientAuthKey } from '../../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireCertifiedOrganizationSession(request, 'organization.chat.read');
  if (!gate.ok) return gate.response;

  const messages = await gate.store.listOrgChatMessages(gate.account.actorId);
  return NextResponse.json({ ok: true, messages });
}

export async function POST(request: Request) {
  const gate = await requireCertifiedOrganizationSession(request, 'organization.chat.post');
  if (!gate.ok) return gate.response;

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
    const message = await gate.store.postOrgChatMessage({
      organizationActorId: gate.account.actorId,
      senderAccountId: gate.account.id,
      senderDisplayName: gate.account.displayName,
      body: typeof body.body === 'string' ? body.body : ''
    });
    return NextResponse.json({ ok: true, message });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reasonCode: 'CHAT_POST_ERROR', message: err instanceof Error ? err.message : 'チャット送信に失敗しました。' },
      { status: 400 }
    );
  }
}
