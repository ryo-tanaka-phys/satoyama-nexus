import { NextResponse } from 'next/server';
import { getActiveVenueFoundationStore } from '../../../../../../lib/venue-runtime';
import {
  extractSessionTokenFromCookieHeader,
  findSpoofedClientAuthKey
} from '../../../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  const store = getActiveVenueFoundationStore();
  const rawToken = extractSessionTokenFromCookieHeader(request.headers.get('cookie'));
  const resolved = await store.resolveSessionByToken(rawToken);
  const { requestId } = await context.params;

  if (!resolved.authenticated || !resolved.account || !resolved.authContext.authenticated) {
    await store.recordVenueAuditEvent({
      actorAccountId: null,
      action: 'certification.review',
      targetId: requestId,
      outcome: 'denied',
      reasonCode: 'UNAUTHENTICATED',
      detailSummary: {}
    });
    return NextResponse.json(
      { ok: false, reasonCode: 'UNAUTHENTICATED', message: '審査には運営アカウントのログインが必要です。' },
      { status: 401 }
    );
  }

  const hasReviewer = resolved.authContext.grants.some((g) => g.role === 'reviewer' && g.revokedAt === null);
  if (!hasReviewer) {
    await store.recordVenueAuditEvent({
      actorAccountId: resolved.account.id,
      action: 'certification.review',
      targetId: requestId,
      outcome: 'denied',
      reasonCode: 'FORBIDDEN_REVIEWER_ONLY',
      detailSummary: { roleTrack: resolved.account.roleTrack }
    });
    return NextResponse.json(
      { ok: false, reasonCode: 'FORBIDDEN_REVIEWER_ONLY', message: '団体認証・専門家資格認証の審査は運営審査担当のみ実行できます。' },
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

  const decision = body.decision === 'approved' ? 'approved' : body.decision === 'rejected' ? 'rejected' : null;
  if (!decision) {
    return NextResponse.json(
      { ok: false, reasonCode: 'INVALID_DECISION', message: '審査結果 (approved / rejected) を指定してください。' },
      { status: 400 }
    );
  }

  const reason = typeof body.reason === 'string' ? body.reason : '';
  const result = await store.reviewCertificationRequest({
    requestId,
    reviewerAccountId: resolved.account.id,
    reviewerOperatedActorIds: resolved.authContext.operatedActorIds,
    decision,
    reason
  });

  if (!result.ok) {
    const status = result.reasonCode === 'SELF_REVIEW_PROHIBITED' ? 403 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
