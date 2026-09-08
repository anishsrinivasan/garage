/**
 * Turns newly-seen listings into alert deliveries.
 *
 * Runs after a scrape. Takes the listings whose `first_seen_at` falls inside
 * this run, evaluates them against active saved searches, and records one
 * delivery row per (search, listing, channel).
 *
 * Two properties matter more than anything else here:
 *
 *   1. **Never notify twice.** A unique index on (search, listing, channel)
 *      enforces it in the database rather than depending on this code
 *      remembering. Duplicate notifications are what get an alert product muted
 *      and then deleted.
 *   2. **Alert on genuine newness.** Matching uses `first_seen_at`, not the
 *      crawl time — a re-scrape that re-confirms 400 existing listings must
 *      produce zero alerts, or the first cron run would notify everybody about
 *      everything.
 *
 * Vertical-agnostic: it operates on the core listing row plus a filter blob, so
 * cars gets alerts for free.
 */

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, listings, savedSearches, alertDeliveries } from "@preowned-cars/db";

export type MatchableListing = {
  id: string;
  vertical: string;
  cityId: string | null;
  localityId: string | null;
  price: string | null;
  firstSeenAt: Date;
};

/**
 * The filter shape a saved search stores — the same keys the search page emits.
 * Unknown keys are ignored rather than treated as a non-match, so an old saved
 * search keeps working after a filter is renamed.
 */
export type SavedFilters = {
  minPrice?: number;
  maxPrice?: number;
  minRent?: number;
  maxRent?: number;
  locality?: string;
  bhk?: number[];
  furnishing?: string;
  propertyType?: string;
  fuelType?: string;
  bodyType?: string;
  [key: string]: unknown;
};

export type AlertMatch = {
  savedSearchId: string;
  listingId: string;
  channels: string[];
};

/**
 * Evaluates one listing against one saved search.
 *
 * Deliberately conservative: a filter this function does not understand is
 * ignored rather than failing the match, because the alternative is a saved
 * search that silently stops firing after an unrelated schema change.
 */
export function matchesFilters(
  listing: MatchableListing & Record<string, unknown>,
  filters: SavedFilters,
): boolean {
  const price = listing.price == null ? null : Number(listing.price);

  const min = filters.minRent ?? filters.minPrice;
  const max = filters.maxRent ?? filters.maxPrice;
  if (min != null && (price == null || price < min)) return false;
  if (max != null && (price == null || price > max)) return false;

  if (filters.locality && listing.localityId !== filters.locality) return false;

  // Attribute filters are checked only when the caller supplied the attribute,
  // which it does by joining the vertical's table before calling.
  if (filters.bhk?.length) {
    const bhk = listing.bhk as number | null | undefined;
    if (bhk == null) return false;
    const wantsFourPlus = filters.bhk.some((b) => b >= 4);
    if (!filters.bhk.includes(bhk) && !(wantsFourPlus && bhk >= 4)) return false;
  }

  for (const key of ["furnishing", "propertyType", "fuelType", "bodyType"] as const) {
    const wanted = filters[key];
    if (!wanted) continue;
    if (listing[key] !== wanted) return false;
  }

  return true;
}

export type EvaluateResult = {
  searchesConsidered: number;
  listingsConsidered: number;
  deliveriesCreated: number;
};

/**
 * Records deliveries for every (active search × newly-seen listing) match.
 *
 * `onConflictDoNothing` against the unique index is what makes this safe to
 * re-run: a retried or overlapping evaluation cannot double-notify.
 */
export async function evaluateAlerts(
  vertical: string,
  since: Date,
  loadCandidates: (vertical: string, since: Date) => Promise<Array<MatchableListing & Record<string, unknown>>>,
): Promise<EvaluateResult> {
  const searches = await db
    .select({
      id: savedSearches.id,
      filters: savedSearches.filters,
      channels: savedSearches.channels,
      cityId: savedSearches.cityId,
    })
    .from(savedSearches)
    .where(and(eq(savedSearches.isActive, true), eq(savedSearches.vertical, vertical)));

  if (searches.length === 0) {
    return { searchesConsidered: 0, listingsConsidered: 0, deliveriesCreated: 0 };
  }

  const candidates = await loadCandidates(vertical, since);
  if (candidates.length === 0) {
    return {
      searchesConsidered: searches.length,
      listingsConsidered: 0,
      deliveriesCreated: 0,
    };
  }

  const rows: Array<{ savedSearchId: string; listingId: string; channel: string }> = [];
  for (const search of searches) {
    for (const listing of candidates) {
      if (search.cityId && listing.cityId !== search.cityId) continue;
      if (!matchesFilters(listing, search.filters as SavedFilters)) continue;
      for (const channel of search.channels) {
        rows.push({ savedSearchId: search.id, listingId: listing.id, channel });
      }
    }
  }

  if (rows.length === 0) {
    return {
      searchesConsidered: searches.length,
      listingsConsidered: candidates.length,
      deliveriesCreated: 0,
    };
  }

  const inserted = await db
    .insert(alertDeliveries)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: alertDeliveries.id });

  if (inserted.length > 0) {
    const searchIds = [...new Set(rows.map((r) => r.savedSearchId))];
    await db
      .update(savedSearches)
      .set({ lastMatchedAt: new Date() })
      .where(inArray(savedSearches.id, searchIds));
  }

  console.log(
    `[alerts] ${vertical}: ${searches.length} search(es) × ${candidates.length} new listing(s) -> ${inserted.length} delivery/deliveries (${rows.length - inserted.length} already sent)`,
  );

  return {
    searchesConsidered: searches.length,
    listingsConsidered: candidates.length,
    deliveriesCreated: inserted.length,
  };
}

/** Listings first seen since a cutoff. The default candidate loader. */
export async function loadNewListings(
  vertical: string,
  since: Date,
): Promise<MatchableListing[]> {
  return db
    .select({
      id: listings.id,
      vertical: listings.vertical,
      cityId: listings.cityId,
      localityId: listings.localityId,
      price: listings.price,
      firstSeenAt: listings.firstSeenAt,
    })
    .from(listings)
    .where(
      and(
        eq(listings.vertical, vertical),
        eq(listings.isActive, true),
        eq(listings.isClusterHead, true),
        gte(listings.firstSeenAt, since),
      ),
    );
}

export type PendingDelivery = {
  id: string;
  channel: string;
  savedSearchId: string;
  listingId: string;
  email: string | null;
  telegramChatId: string | null;
  label: string;
  unsubscribeToken: string;
};

/** Deliveries waiting to be sent, respecting each subscriber's rate limit. */
export async function getPendingDeliveries(limit = 200): Promise<PendingDelivery[]> {
  return db
    .select({
      id: alertDeliveries.id,
      channel: alertDeliveries.channel,
      savedSearchId: alertDeliveries.savedSearchId,
      listingId: alertDeliveries.listingId,
      email: savedSearches.email,
      telegramChatId: savedSearches.telegramChatId,
      label: savedSearches.label,
      unsubscribeToken: savedSearches.unsubscribeToken,
    })
    .from(alertDeliveries)
    .innerJoin(savedSearches, eq(savedSearches.id, alertDeliveries.savedSearchId))
    .where(
      and(
        eq(alertDeliveries.status, "pending"),
        eq(savedSearches.isActive, true),
        // Honour the digest interval: a subscriber notified five minutes ago
        // waits, rather than receiving a second message.
        sql`(${savedSearches.lastNotifiedAt} is null
             or ${savedSearches.lastNotifiedAt} < now() - (${savedSearches.minIntervalMinutes} || ' minutes')::interval)`,
      ),
    )
    .limit(limit);
}

export async function markDelivered(
  ids: string[],
  status: "sent" | "failed",
  error?: string,
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(alertDeliveries)
    .set({ status, sentAt: new Date(), error: error?.slice(0, 500) ?? null })
    .where(inArray(alertDeliveries.id, ids));
}
