import { NextRequest, NextResponse } from 'next/server';
import { getWorkbench } from '../../../../lib/simulation-store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const activityId = request.nextUrl.searchParams.get('activityId') ?? undefined;
  return NextResponse.json(getWorkbench().getSnapshot(activityId));
}
