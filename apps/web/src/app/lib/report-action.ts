"use server";

import { db, listingReports } from "@preowned-cars/db";

export async function submitListingReport(data: {
  listingId: string;
  reportType: string;
  description?: string;
}) {
  if (!data.listingId || !data.reportType) {
    throw new Error("Missing required fields");
  }

  await db.insert(listingReports).values({
    listingId: data.listingId,
    reportType: data.reportType,
    description: data.description?.trim() || null,
  });
}
