import { NextRequest, NextResponse } from 'next/server';
import type { DemoPersonaId } from '../../../../lib/simulation-store';
import { getActiveWorkbench } from '../../../../lib/workbench-runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    personaId?: DemoPersonaId;
    title?: string;
    locationLabel?: string;
    latitude?: number | null;
    longitude?: number | null;
    requiredSkills?: string[];
    transportModes?: string[];
    itemsToConfirm?: string[];
    scheduleStartAt?: string | null;
  };

  const result = await getActiveWorkbench().createActivityProposal(body.personaId ?? 'anonymous', {
    title: body.title ?? '',
    locationLabel: body.locationLabel ?? '',
    latitude: typeof body.latitude === 'number' ? body.latitude : null,
    longitude: typeof body.longitude === 'number' ? body.longitude : null,
    scheduleStartAt: typeof body.scheduleStartAt === 'string' ? body.scheduleStartAt : null,
    requiredSkills: Array.isArray(body.requiredSkills) ? body.requiredSkills : [],
    transportModes: Array.isArray(body.transportModes) ? body.transportModes : [],
    itemsToConfirm: Array.isArray(body.itemsToConfirm) ? body.itemsToConfirm : []
  });

  return NextResponse.json(result, { status: result.ok ? 201 : 400 });
}
