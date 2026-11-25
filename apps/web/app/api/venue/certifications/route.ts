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
      { ok: false, reasonCode: 'UNAUTHENTICATED', message: '認証申請にはログインが必要です。' },
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

  const kind = body.kind === 'organization' ? 'organization' : body.kind === 'expert' ? 'expert' : null;
  if (!kind) {
    return NextResponse.json(
      { ok: false, reasonCode: 'INVALID_CERTIFICATION_KIND', message: '申請種別 (organization / expert) を指定してください。' },
      { status: 400 }
    );
  }

  const summary = typeof body.summary === 'string' ? body.summary : '';
  const evidenceNote = typeof body.evidenceNote === 'string' ? body.evidenceNote : null;
  const organizationName = typeof body.organizationName === 'string' ? body.organizationName : null;

  try {
    const certRequest = await store.submitCertificationRequest({
      kind,
      applicantAccountId: resolved.account.id,
      targetActorId: resolved.account.actorId,
      organizationName,
      summary,
      evidenceNote
    });
    return NextResponse.json({ ok: true, request: certRequest });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reasonCode: 'CERTIFICATION_SUBMIT_FAILED',
        message: err instanceof Error ? err.message : '認証申請に失敗しました。'
      },
      { status: 400 }
    );
  }
}
