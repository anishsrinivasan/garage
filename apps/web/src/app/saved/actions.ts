"use server";

import { getListingsByIds } from "@/app/lib/queries";

export async function fetchSavedListings(ids: string[]) {
  return getListingsByIds(ids);
}
