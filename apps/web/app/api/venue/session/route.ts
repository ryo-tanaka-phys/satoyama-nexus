import { NextResponse } from 'next/server';
import { checkCertifiedOrganizationAccess, toPublicVenueProfile } from '@satoyama/domain';
import { getActiveVenueFoundationStore } from '../../../../lib/venue-runtime';
import { extractSessionTokenFromCookieHeader } from '../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const store = getActiveVenueFoundationStore();
  const rawToken = extractSessionTokenFromCookieHeader(request.headers.get('cookie'));
  const resolved = await store.resolveSessionByToken(rawToken);
  const snapshot = await store.getFoundationSnapshot();
  const notifications =
    resolved.authenticated && resolved.account
      ? await store.listNotificationsForActor(resolved.account.actorId)
      : [];

  // Private org chat is returned ONLY when server verifies certified org leader access
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

  const publicApprovalVisibility =
    process.env.PUBLIC_APPROVAL_VISIBILITY === 'outcome-only' ? 'outcome-only' : 'full-process';

  return NextResponse.json({
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
    publicApprovalVisibility,
    snapshot,
    serverTimestamp: new Date().toISOString()
  });
}
