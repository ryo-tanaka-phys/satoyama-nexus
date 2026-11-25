import { NextResponse } from 'next/server';
import { requireCertifiedOrganizationSession } from '../../../../../lib/venue-org-gate';
import { findSpoofedClientAuthKey } from '../../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const gate = await requireCertifiedOrganizationSession(request, 'organization.members.add');
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
    const added = await gate.store.addDummyOrgMember({
      organizationActorId: gate.account.actorId,
      displayName: typeof body.displayName === 'string' ? body.displayName : '',
      roleNote: typeof body.roleNote === 'string' ? body.roleNote : undefined
    });
    return NextResponse.json({ ok: true, ...added });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reasonCode: 'MEMBER_ADD_ERROR', message: err instanceof Error ? err.message : 'メンバー追加に失敗しました。' },
      { status: 400 }
    );
  }
}
