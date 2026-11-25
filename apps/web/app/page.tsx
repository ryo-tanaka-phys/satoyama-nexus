import { cookies } from 'next/headers';
import { toPublicVenueProfile } from '@satoyama/domain';
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

  const initialData: InitialVenuePageData = {
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
    snapshot
  };

  return <VenueEntryClient initialData={initialData} />;
}
