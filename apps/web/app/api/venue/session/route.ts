import { NextResponse } from 'next/server';
import { toPublicVenueProfile } from '@satoyama/domain';
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

  return NextResponse.json({
    authenticated: resolved.authenticated,
    mode: resolved.session?.mode ?? null,
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
    snapshot,
    serverTimestamp: new Date().toISOString()
  });
}
