import { NextResponse } from 'next/server';
import { getWorkbench } from '../../../../lib/simulation-store';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({ ok: true, snapshot: getWorkbench().reset() });
}
