import { NextRequest, NextResponse } from 'next/server';
import type { DemoPersonaId } from '../../../../lib/simulation-store';
import { getActiveWorkbench } from '../../../../lib/workbench-runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    personaId?: DemoPersonaId;
    caseId?: string;
    expectedVersion?: number;
    decision?: 'approved' | 'rejected';
    reason?: string;
    aiRecommendationId?: string | null;
    policyVersion?: string;
  };

  const result = await getActiveWorkbench().submitHumanReview(body.personaId ?? 'anonymous', {
    caseId: body.caseId ?? '',
    expectedVersion: Number(body.expectedVersion ?? 0),
    decision: body.decision === 'rejected' ? 'rejected' : 'approved',
    reason: body.reason ?? '',
    aiRecommendationId: body.aiRecommendationId ?? null,
    policyVersion: body.policyVersion
  });

  const status = result.ok ? 200 : result.reasonCode === 'UNAUTHENTICATED' ? 401 : 403;
  return NextResponse.json(result, { status });
}
