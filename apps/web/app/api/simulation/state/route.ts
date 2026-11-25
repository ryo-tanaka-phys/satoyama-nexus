import { NextRequest, NextResponse } from 'next/server';
import { getActiveWorkbench } from '../../../../lib/workbench-runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const activityId = request.nextUrl.searchParams.get('activityId') ?? undefined;
  return NextResponse.json(await getActiveWorkbench().getSnapshot(activityId));
}
