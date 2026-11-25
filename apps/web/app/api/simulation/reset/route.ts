import { NextResponse } from 'next/server';
import { getActiveWorkbench } from '../../../../lib/workbench-runtime';

export const dynamic = 'force-dynamic';

export async function POST() {
  const result = await getActiveWorkbench().reset();
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
