import { NextRequest, NextResponse } from 'next/server';
import { getWorkbench, type DemoPersonaId } from '../../../../lib/simulation-store';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    personaId?: DemoPersonaId;
    activityId?: string;
    candidateActorId?: string;
    role?: string;
  };

  const result = getWorkbench().createDraftCase(body.personaId ?? 'anonymous', {
    activityId: body.activityId ?? '',
    candidateActorId: body.candidateActorId ?? '',
    role: body.role
  });

  return NextResponse.json(result, { status: result.ok ? 201 : 400 });
}
