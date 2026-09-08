"use server";

import { getListingsByIds } from "@/app/lib/queries";
import { getRentalsByIds } from "@/app/lib/rentals-queries";

/**
 * Bookmarks are ids in localStorage with no vertical attached, so both modules
 * are asked and each returns only what it owns. Rendering every bookmark with
 * the car card used to draw a saved flat as a 2021 car with no price.
 */
export async function fetchSavedListings(ids: string[]) {
  const [cars, rentals] = await Promise.all([
    getListingsByIds(ids),
    getRentalsByIds(ids),
  ]);
  // Restore the order the bookmarks arrived in, across both verticals.
  const rank = new Map(ids.map((id, i) => [id, i]));
  return {
    cars,
    rentals,
    order: [...cars.map((c) => c.id), ...rentals.map((r) => r.id)].sort(
      (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0),
    ),
  };
}
