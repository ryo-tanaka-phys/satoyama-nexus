import { NextResponse } from 'next/server';
import { getActiveVenueFoundationStore } from '../../../../lib/venue-runtime';
import { requireCertifiedOrganizationSession } from '../../../../lib/venue-org-gate';
import {
  extractSessionTokenFromCookieHeader,
  findSpoofedClientAuthKey
} from '../../../../lib/venue-session';
import type { PublicInteractionDirection, PublicInteractionKind } from '../../../../../../db/venue-store';

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

  const direction: PublicInteractionDirection | null =
    body.direction === 'to-government'
      ? 'to-government'
      : body.direction === 'from-government'
        ? 'from-government'
        : null;
  if (!direction) {
    return NextResponse.json(
      { ok: false, reasonCode: 'INVALID_DIRECTION', message: 'direction (to-government / from-government) を指定してください。' },
      { status: 400 }
    );
  }

  const title = typeof body.title === 'string' ? body.title : '';
  const content = typeof body.body === 'string' ? body.body : '';
  const toActorId = typeof body.toActorId === 'string' ? body.toActorId.trim() : '';
  if (!toActorId) {
    return NextResponse.json(
      { ok: false, reasonCode: 'TARGET_REQUIRED', message: '送信先アカウントを指定してください。' },
      { status: 400 }
    );
  }

  if (direction === 'to-government') {
    const gate = await requireCertifiedOrganizationSession(request, 'public.petition.submit');
    if (!gate.ok) return gate.response;

    const kind: PublicInteractionKind = body.kind === 'petition' ? 'petition' : 'support-request';
    try {
      const created = await gate.store.createPublicInteraction({
        direction: 'to-government',
        kind,
        fromActorId: gate.account.actorId,
        toActorId,
        actorAccountId: gate.account.id,
        reportId: typeof body.reportId === 'string' ? body.reportId : null,
        title,
        body: content
      });
      return NextResponse.json({ ok: true, ...created });
    } catch (err) {
      return NextResponse.json(
        { ok: false, reasonCode: 'PETITION_FAILED', message: err instanceof Error ? err.message : '申請の提出に失敗しました。' },
        { status: 400 }
      );
    }
  }

  // direction === 'from-government'
  const store = getActiveVenueFoundationStore();
  const rawToken = extractSessionTokenFromCookieHeader(request.headers.get('cookie'));
  const resolved = await store.resolveSessionByToken(rawToken);
  if (!resolved.authenticated || !resolved.account) {
    return NextResponse.json(
      { ok: false, reasonCode: 'UNAUTHENTICATED', message: '自治体オファー発信にはログインが必要です。' },
      { status: 401 }
    );
  }
  if (resolved.account.roleTrack !== 'government') {
    await store.recordVenueAuditEvent({
      actorAccountId: resolved.account.id,
      action: 'government.offer.send',
      targetId: toActorId,
      outcome: 'denied',
      reasonCode: 'FORBIDDEN_GOVERNMENT_ONLY',
      detailSummary: { roleTrack: resolved.account.roleTrack }
    });
    return NextResponse.json(
      { ok: false, reasonCode: 'FORBIDDEN_GOVERNMENT_ONLY', message: '公的オファーの発信は自治体アカウントのみ可能です。' },
      { status: 403 }
    );
  }

  const kind: PublicInteractionKind = body.kind === 'partnership-offer' ? 'partnership-offer' : 'government-offer';
  try {
    const created = await store.createPublicInteraction({
      direction: 'from-government',
      kind,
      fromActorId: resolved.account.actorId,
      toActorId,
      actorAccountId: resolved.account.id,
      reportId: null,
      title,
      body: content
    });
    return NextResponse.json({ ok: true, ...created });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reasonCode: 'OFFER_FAILED', message: err instanceof Error ? err.message : 'オファー発信に失敗しました。' },
      { status: 400 }
    );
  }
}
