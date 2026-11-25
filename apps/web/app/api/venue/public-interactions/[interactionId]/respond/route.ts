import { NextResponse } from 'next/server';
import { getActiveVenueFoundationStore } from '../../../../../../lib/venue-runtime';
import {
  extractSessionTokenFromCookieHeader,
  findSpoofedClientAuthKey
} from '../../../../../../lib/venue-session';
import type { PublicInteractionStatus } from '../../../../../../../../db/venue-store';

export const dynamic = 'force-dynamic';

const VALID_NEXT_STATUSES: readonly Exclude<PublicInteractionStatus, 'submitted'>[] = [
  'under-review',
  'questioned',
  'approved',
  'supported',
  'returned',
  'accepted',
  'declined'
];

export async function POST(
  request: Request,
  context: { params: Promise<{ interactionId: string }> }
) {
  const store = getActiveVenueFoundationStore();
  const rawToken = extractSessionTokenFromCookieHeader(request.headers.get('cookie'));
  const resolved = await store.resolveSessionByToken(rawToken);
  if (!resolved.authenticated || !resolved.account) {
    return NextResponse.json(
      { ok: false, reasonCode: 'UNAUTHENTICATED', message: '公的やり取りへの応答にはログインが必要です。' },
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

  const nextStatus = body.nextStatus as Exclude<PublicInteractionStatus, 'submitted'>;
  if (!VALID_NEXT_STATUSES.includes(nextStatus)) {
    return NextResponse.json(
      { ok: false, reasonCode: 'INVALID_STATUS', message: '有効な応答ステータスを指定してください。' },
      { status: 400 }
    );
  }

  const { interactionId } = await context.params;
  const reason = typeof body.reason === 'string' ? body.reason : '';

  const result = await store.respondPublicInteraction({
    interactionId,
    actorAccountId: resolved.account.id,
    actorId: resolved.account.actorId,
    roleTrack: resolved.account.roleTrack,
    nextStatus,
    reason
  });

  if (!result.ok) {
    const status =
      result.reasonCode === 'FORBIDDEN_GOVERNMENT_ONLY' || result.reasonCode === 'FORBIDDEN_RECIPIENT_ONLY'
        ? 403
        : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
