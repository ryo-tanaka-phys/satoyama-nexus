import { NextRequest, NextResponse } from 'next/server';
import { getActiveWorkbench } from '../../../../lib/workbench-runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { caseId?: string };
  const result = await getActiveWorkbench().runAIPrimaryReview(body.caseId ?? '');
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
