import { NextRequest, NextResponse } from 'next/server';
import type { CollaborationStage } from '@satoyama/domain';
import type { DemoPersonaId } from '../../../../lib/simulation-store';
import { getActiveWorkbench } from '../../../../lib/workbench-runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    personaId?: DemoPersonaId;
    caseId?: string;
    expectedVersion?: number;
    targetStage?: CollaborationStage;
    simulationNote?: string;
  };

  const result = await getActiveWorkbench().advanceCaseStage(body.personaId ?? 'anonymous', {
    caseId: body.caseId ?? '',
    expectedVersion: Number(body.expectedVersion ?? 0),
    targetStage: body.targetStage ?? 'requested',
    simulationNote: body.simulationNote
  });

  const status = result.ok ? 200 : result.reasonCode === 'UNAUTHENTICATED' ? 401 : 403;
  return NextResponse.json(result, { status });
}
