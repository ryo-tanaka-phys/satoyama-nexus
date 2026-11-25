import { cookies } from 'next/headers';
import { getActiveVenueFoundationStore } from '../../lib/venue-runtime';
import { VENUE_SESSION_COOKIE_NAME } from '../../lib/venue-session';
import { buildClassroomVerificationCoverage } from '../../lib/werewolf-coverage';
import { WerewolfClient, type WerewolfStatePayload } from './werewolf-client';

export const dynamic = 'force-dynamic';

export default async function WerewolfModePage() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(VENUE_SESSION_COOKIE_NAME)?.value ?? null;
  const store = getActiveVenueFoundationStore();
  const resolved = await store.resolveSessionByToken(rawToken);

  const isOperator = resolved.authenticated && resolved.account?.roleTrack === 'operator';
  const rooms = isOperator ? await store.listWerewolfRooms() : [];
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
  }

  const initialState: WerewolfStatePayload = {
    authenticated: resolved.authenticated,
    account: resolved.account,
    mode: resolved.session?.mode ?? null,
    isOperator,
    rooms,
    myRoom: myAssignment?.room ?? activeRoomState?.room ?? null,
    myAssignment: myAssignment?.assignment ?? null,
    participantCount: activeRoomState?.participants.length ?? 0,
    participantNames: activeRoomState ? activeRoomState.participants.map((p) => p.displayName) : [],
    verificationCoverage
  };

  return <WerewolfClient initialState={initialState} />;
}
