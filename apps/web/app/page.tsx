import { cookies } from 'next/headers';
import { checkCertifiedOrganizationAccess, toPublicVenueProfile } from '@satoyama/domain';
import { getActiveVenueFoundationStore } from '../lib/venue-runtime';
import { VENUE_SESSION_COOKIE_NAME } from '../lib/venue-session';
import { VenueEntryClient, type InitialVenuePageData } from './venue-entry-client';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(VENUE_SESSION_COOKIE_NAME)?.value ?? null;

  const store = getActiveVenueFoundationStore();
  const resolved = await store.resolveSessionByToken(rawToken);
  const snapshot = await store.getFoundationSnapshot();
  const notifications =
    resolved.authenticated && resolved.account
      ? await store.listNotificationsForActor(resolved.account.actorId)
      : [];

  const orgAccess = checkCertifiedOrganizationAccess(resolved.authContext, resolved.profile);
  const orgChatMessages =
    orgAccess.ok && resolved.account
      ? await store.listOrgChatMessages(resolved.account.actorId)
      : [];

  const werewolfAssignment =
    resolved.authenticated &&
    resolved.account &&
    resolved.session?.mode === 'werewolf' &&
    resolved.session.werewolfRoomId
      ? await store.getWerewolfAssignmentForAccount(resolved.session.werewolfRoomId, resolved.account.id)
      : null;

  const initialData: InitialVenuePageData = {
    authenticated: resolved.authenticated,
    mode: resolved.session?.mode ?? null,
    werewolfAssignment,
    account: resolved.account,
    publicProfile: resolved.profile ? toPublicVenueProfile(resolved.profile) : null,
    authSummary: resolved.authContext.authenticated
      ? {
          userAccountId: resolved.authContext.userAccountId,
          roles: resolved.authContext.grants.map((g) => g.role),
          operatedActorIds: resolved.authContext.operatedActorIds
        }
      : null,
    notifications,
    orgChatMessages,
    publicApprovalVisibility:
      process.env.PUBLIC_APPROVAL_VISIBILITY === 'outcome-only' ? 'outcome-only' : 'full-process',
    snapshot,
    serverTimestamp: new Date().toISOString()
  };

  return <VenueEntryClient initialData={initialData} />;
}
