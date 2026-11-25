import { NextResponse } from 'next/server';
import { requireCertifiedOrganizationSession } from '../../../../../lib/venue-org-gate';
import { findSpoofedClientAuthKey } from '../../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const gate = await requireCertifiedOrganizationSession(request, 'organization.report.generate');
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
    const generated = await gate.store.generateActivityReport({
      organizationActorId: gate.account.actorId,
      createdByAccountId: gate.account.id,
      title: typeof body.title === 'string' ? body.title : '活動実績 簡易透明化レポート',
      periodLabel: typeof body.periodLabel === 'string' ? body.periodLabel : '2026年11月 実証期間',
      additionalNote: typeof body.additionalNote === 'string' ? body.additionalNote : undefined
    });
    return NextResponse.json({ ok: true, ...generated });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reasonCode: 'REPORT_ERROR', message: err instanceof Error ? err.message : 'レポート生成に失敗しました。' },
      { status: 400 }
    );
  }
}
