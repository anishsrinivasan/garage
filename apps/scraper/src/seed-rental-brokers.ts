/**
 * Registers Chennai rental broker accounts.
 *
 *   bun run apps/scraper/src/seed-rental-brokers.ts <handle> [handle ...]
 *
 * Handles are required. An earlier version shipped a "starter list" of plausible
 * names — four of the five did not exist, and the run spent a minute discovering
 * that. Guessed handles are worse than none: they produce empty runs that look
 * like a broken scraper.
 *
 * Find real ones by searching Instagram for the locality plus "rent", then check
 * the account actually posts inventory rather than interior-design content.
 * The admin's add-by-Instagram flow previews the profile before saving, which is
 * the better path once you have the app running.
 */

import { and, eq } from "drizzle-orm";
import { db, garages, dealerSources } from "@preowned-cars/db";
import { normalizeHandle, slugify } from "./garage-onboarding";

async function upsertBroker(rawHandle: string): Promise<"created" | "updated"> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) throw new Error(`"${rawHandle}" is not a usable handle`);

  const [existing] = await db
    .select({ id: dealerSources.id, garageId: dealerSources.garageId })
    .from(dealerSources)
    .where(and(eq(dealerSources.platform, "instagram"), eq(dealerSources.handle, handle)))
    .limit(1);

  if (existing) {
    // Re-running must be able to correct a source that was filed as cars.
    await db
      .update(dealerSources)
      .set({ vertical: "rentals", isActive: true, updatedAt: new Date() })
      .where(eq(dealerSources.id, existing.id));
    await db
      .update(garages)
      .set({ vertical: "rentals", kind: "broker", updatedAt: new Date() })
      .where(eq(garages.id, existing.garageId));
    return "updated";
  }

  const [org] = await db
    .insert(garages)
    .values({
      slug: slugify(handle),
      name: handle,
      kind: "broker",
      vertical: "rentals",
      city: "Chennai",
      instagramUrl: `https://www.instagram.com/${handle}/`,
      isActive: true,
    })
    .returning({ id: garages.id });

  await db.insert(dealerSources).values({
    garageId: org!.id,
    platform: "instagram",
    handle,
    sourceType: "instagram_dealer",
    vertical: "rentals",
    isActive: true,
  });
  return "created";
}

async function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error(
      "Usage: bun run apps/scraper/src/seed-rental-brokers.ts <handle> [handle ...]\n\n" +
        "Handles are required on purpose — a guessed handle produces an empty run\n" +
        "that looks like a broken scraper. Verify the account exists and posts\n" +
        "rental inventory first.",
    );
    process.exit(1);
  }

  console.log(`Registering ${targets.length} rental broker(s)…`);
  let created = 0;
  let updated = 0;
  for (const handle of targets) {
    try {
      const result = await upsertBroker(handle);
      result === "created" ? created++ : updated++;
      console.log(`  ${result === "created" ? "+" : "~"} @${normalizeHandle(handle)}`);
    } catch (err) {
      console.warn(`  ! ${handle}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n${created} created, ${updated} updated.`);
  console.log("Next: bun run scrape -- --source instagram-rentals");
  process.exit(0);
}

void main();
