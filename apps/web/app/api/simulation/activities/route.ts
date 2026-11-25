import { NextRequest, NextResponse } from 'next/server';
import { getWorkbench, type DemoPersonaId } from '../../../../lib/simulation-store';

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
  };

  const result = getWorkbench().createActivityProposal(body.personaId ?? 'anonymous', {
    title: body.title ?? '',
    locationLabel: body.locationLabel ?? '',
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    requiredSkills: Array.isArray(body.requiredSkills) ? body.requiredSkills : [],
    transportModes: Array.isArray(body.transportModes) ? body.transportModes : [],
    itemsToConfirm: Array.isArray(body.itemsToConfirm) ? body.itemsToConfirm : []
  });

  return NextResponse.json(result, { status: result.ok ? 201 : 400 });
}
