import { createPgPoolForWorkbench } from '../../../db/workbench-store';
import {
  InMemoryVenueFoundationStore,
  PgVenueFoundationStore,
  type VenueFoundationStorePort
} from '../../../db/venue-store';

const globalForVenue = globalThis as unknown as {
  __satoyamaPgVenueStore?: PgVenueFoundationStore;
  __satoyamaMemVenueStore?: InMemoryVenueFoundationStore;
  __satoyamaTestOverrideVenueStore?: VenueFoundationStorePort | null;
};

/** Test-only hook allowing isolated per-suite store injection even when DATABASE_URL is set in CI. */
export function setActiveVenueFoundationStoreForTest(store: VenueFoundationStorePort | null): void {
  globalForVenue.__satoyamaTestOverrideVenueStore = store;
}

/**
 * Returns PostgreSQL/PostGIS-backed venue store when DATABASE_URL is configured,
 * falling back cleanly to the in-memory foundation store when unset.
 */
export function getActiveVenueFoundationStore(): VenueFoundationStorePort {
  if (globalForVenue.__satoyamaTestOverrideVenueStore) {
    return globalForVenue.__satoyamaTestOverrideVenueStore;
  }

  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl) {
    if (!globalForVenue.__satoyamaPgVenueStore) {
      const pool = createPgPoolForWorkbench(dbUrl);
      globalForVenue.__satoyamaPgVenueStore = new PgVenueFoundationStore(pool);
    }
    return globalForVenue.__satoyamaPgVenueStore;
  }

  if (!globalForVenue.__satoyamaMemVenueStore) {
    globalForVenue.__satoyamaMemVenueStore = new InMemoryVenueFoundationStore();
  }
  return globalForVenue.__satoyamaMemVenueStore;
}
