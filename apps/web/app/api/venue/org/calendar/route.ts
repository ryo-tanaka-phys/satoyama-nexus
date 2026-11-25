import { NextResponse } from 'next/server';
import { requireCertifiedOrganizationSession } from '../../../../../lib/venue-org-gate';
import { findSpoofedClientAuthKey } from '../../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const gate = await requireCertifiedOrganizationSession(request, 'organization.calendar.write');
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
    if (body.action === 'toggle-status') {
      const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
      const status = body.status === 'completed' ? 'completed' : 'planned';
      const event = await gate.store.updateOrgCalendarEventStatus(eventId, gate.account.actorId, status);
      return NextResponse.json({ ok: true, event });
    }

    const event = await gate.store.createOrgCalendarEvent({
      organizationActorId: gate.account.actorId,
      title: typeof body.title === 'string' ? body.title : '',
      scheduledDate: typeof body.scheduledDate === 'string' ? body.scheduledDate : '',
      gridCellId: typeof body.gridCellId === 'string' ? body.gridCellId : gate.profile.gridCellId,
      status: body.status === 'completed' ? 'completed' : 'planned',
      participantCount: typeof body.participantCount === 'number' ? body.participantCount : Number(body.participantCount ?? 0),
      summary: typeof body.summary === 'string' ? body.summary : ''
    });
    return NextResponse.json({ ok: true, event });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reasonCode: 'CALENDAR_ERROR', message: err instanceof Error ? err.message : 'カレンダー登録に失敗しました。' },
      { status: 400 }
    );
  }
}
