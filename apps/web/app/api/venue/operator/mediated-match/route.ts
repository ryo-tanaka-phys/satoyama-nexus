import { NextResponse } from 'next/server';
import { getActiveVenueFoundationStore } from '../../../../../lib/venue-runtime';
import {
  extractSessionTokenFromCookieHeader,
  findSpoofedClientAuthKey
} from '../../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const store = getActiveVenueFoundationStore();
  const rawToken = extractSessionTokenFromCookieHeader(request.headers.get('cookie'));
  const resolved = await store.resolveSessionByToken(rawToken);

  if (!resolved.authenticated || !resolved.account || !resolved.authContext.authenticated) {
    return NextResponse.json(
      { ok: false, reasonCode: 'UNAUTHENTICATED', message: '仲介マッチング審査には運営ログインが必要です。' },
      { status: 401 }
    );
  }

  const hasReviewer = resolved.authContext.grants.some((g) => g.role === 'reviewer' && g.revokedAt === null);
  if (!hasReviewer) {
    await store.recordVenueAuditEvent({
      actorAccountId: resolved.account.id,
      action: 'mediated-match.access',
      targetId: 'operator-mediated-match',
      outcome: 'denied',
      reasonCode: 'FORBIDDEN_REVIEWER_ONLY',
      detailSummary: { roleTrack: resolved.account.roleTrack }
    });
    return NextResponse.json(
      { ok: false, reasonCode: 'FORBIDDEN_REVIEWER_ONLY', message: '厳格審査付き仲介マッチングは運営審査担当のみ実行できます。' },
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

  const step = body.step === 'ai-review' ? 'ai-review' : body.step === 'human-review' ? 'human-review' : null;
  const citizenActorId = typeof body.citizenActorId === 'string' ? body.citizenActorId.trim() : '';
  const targetOrgActorId = typeof body.targetOrgActorId === 'string' ? body.targetOrgActorId.trim() : '';

  if (!step || !citizenActorId || !targetOrgActorId) {
    return NextResponse.json(
      { ok: false, reasonCode: 'INVALID_MEDIATED_INPUT', message: 'step・対象市民・対象団体を指定してください。' },
      { status: 400 }
    );
  }

  if (step === 'ai-review') {
    try {
      const result = await store.runMediatedAIPrimaryReview({
        operatorAccountId: resolved.account.id,
        citizenActorId,
        targetOrgActorId
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json(
        { ok: false, reasonCode: 'AI_REVIEW_FAILED', message: err instanceof Error ? err.message : 'AI一次評価に失敗しました。' },
        { status: 400 }
      );
    }
  }

  const decision = body.decision === 'approved' ? 'approved' : body.decision === 'rejected' ? 'rejected' : null;
  if (!decision) {
    return NextResponse.json(
      { ok: false, reasonCode: 'INVALID_DECISION', message: '人間二次審査の判定 (approved / rejected) を指定してください。' },
      { status: 400 }
    );
  }

  const recommendationId = typeof body.recommendationId === 'string' ? body.recommendationId : null;
  const reason = typeof body.reason === 'string' ? body.reason : '';

  const reviewRes = await store.submitMediatedHumanReview({
    reviewerAccountId: resolved.account.id,
    reviewerOperatedActorIds: resolved.authContext.operatedActorIds,
    citizenActorId,
    targetOrgActorId,
    recommendationId,
    decision,
    reason
  });

  if (!reviewRes.ok) {
    const status = reviewRes.reasonCode === 'SELF_REVIEW_PROHIBITED' ? 403 : 400;
    return NextResponse.json(reviewRes, { status });
  }

  return NextResponse.json(reviewRes);
}
