import { NextResponse } from 'next/server';
import { requireCertifiedOrganizationSession } from '../../../../../lib/venue-org-gate';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const gate = await requireCertifiedOrganizationSession(request, 'corporate.offer.acknowledge');
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reasonCode: 'INVALID_JSON', message: 'リクエスト形式が不正です。' }, { status: 400 });
  }

  const offerId = typeof body.offerId === 'string' ? body.offerId.trim() : '';
  if (!offerId) {
    return NextResponse.json({ ok: false, reasonCode: 'OFFER_ID_REQUIRED', message: 'offerId を指定してください。' }, { status: 400 });
  }

  const ok = await gate.store.acknowledgeCorporateOffer(offerId, gate.account.actorId);
  return NextResponse.json({ ok });
}
