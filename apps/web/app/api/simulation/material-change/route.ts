import { NextRequest, NextResponse } from 'next/server';
import type { MaterialChangeKind } from '@satoyama/domain';
import type { DemoPersonaId } from '../../../../lib/simulation-store';
import { getActiveWorkbench } from '../../../../lib/workbench-runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    personaId?: DemoPersonaId;
    caseId?: string;
    expectedVersion?: number;
    changeKind?: MaterialChangeKind;
    changeSummary?: string;
    addActorId?: string;
  };

  const result = await getActiveWorkbench().applyMaterialChange(body.personaId ?? 'anonymous', {
    caseId: body.caseId ?? '',
    expectedVersion: Number(body.expectedVersion ?? 0),
    changeKind: body.changeKind ?? 'participation-condition',
    changeSummary: body.changeSummary ?? '参加条件の重要変更（再審査確認用）',
    addActorId: body.addActorId
  });

  const status = result.ok ? 200 : result.reasonCode === 'UNAUTHENTICATED' ? 401 : 403;
  return NextResponse.json(result, { status });
}
