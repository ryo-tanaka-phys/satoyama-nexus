import { NextRequest, NextResponse } from 'next/server';
import type { DemoPersonaId } from '../../../../lib/simulation-store';
import { getActiveWorkbench } from '../../../../lib/workbench-runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    personaId?: DemoPersonaId;
    activityId?: string;
    candidateActorId?: string;
    role?: string;
  };

  const result = await getActiveWorkbench().createDraftCase(body.personaId ?? 'anonymous', {
    activityId: body.activityId ?? '',
    candidateActorId: body.candidateActorId ?? '',
    role: body.role
  });

  return NextResponse.json(result, { status: result.ok ? 201 : 400 });
}
