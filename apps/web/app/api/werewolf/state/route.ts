import { NextResponse } from 'next/server';
import { getActiveVenueFoundationStore } from '../../../../lib/venue-runtime';
import { extractSessionTokenFromCookieHeader } from '../../../../lib/venue-session';
import { buildClassroomVerificationCoverage } from '../../../../lib/werewolf-coverage';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const store = getActiveVenueFoundationStore();
  const rawToken = extractSessionTokenFromCookieHeader(request.headers.get('cookie'));
  const resolved = await store.resolveSessionByToken(rawToken);
  const url = new URL(request.url);
  const queryCode = url.searchParams.get('code')?.trim() ?? '';

  const isOperator = resolved.authenticated && resolved.account?.roleTrack === 'operator';
  const allRooms = isOperator ? await store.listWerewolfRooms() : [];
  const verificationCoverage = isOperator
    ? buildClassroomVerificationCoverage(await store.getFoundationSnapshot())
    : null;

  let myAssignment = null;
  let activeRoomState = null;

  if (resolved.authenticated && resolved.account && resolved.session?.werewolfRoomId) {
    myAssignment = await store.getWerewolfAssignmentForAccount(
      resolved.session.werewolfRoomId,
      resolved.account.id
    );
    activeRoomState = await store.getWerewolfRoomStateByCodeOrId(resolved.session.werewolfRoomId);
  } else if (queryCode) {
    activeRoomState = await store.getWerewolfRoomStateByCodeOrId(queryCode);
  }

  return NextResponse.json({
    authenticated: resolved.authenticated,
    account: resolved.account,
    mode: resolved.session?.mode ?? null,
    isOperator,
    rooms: allRooms,
    myRoom: myAssignment?.room ?? activeRoomState?.room ?? null,
    myAssignment: myAssignment?.assignment ?? null,
    participantCount: activeRoomState?.participants.length ?? 0,
    participantNames: activeRoomState ? activeRoomState.participants.map((p) => p.displayName) : [],
    verificationCoverage
  });
}
