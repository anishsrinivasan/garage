/**
 * Seeds Chennai rental broker accounts.
 *
 *   bun run apps/scraper/src/seed-rental-brokers.ts [handle ...]
 *
 * With no arguments it seeds the starter list below. Pass handles to add your
 * own. The admin's add-by-Instagram flow is the nicer path once you have one;
 * this exists so a fresh install has something to scrape.
 *
 * Verify a handle actually posts rental inventory before adding it — a page
 * that posts only interior-design content burns extraction spend and returns
 * nothing.
 */

import { and, eq } from "drizzle-orm";
import { db, garages, dealerSources } from "@preowned-cars/db";
import { normalizeHandle, slugify } from "./garage-onboarding";

const STARTER_HANDLES = [
  "chennairentalhomes",
  "chennai_rental_property",
  "rentalhouse_chennai",
  "chennai_house_for_rent",
  "homes4rentchennai",
];

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
  const handles = process.argv.slice(2);
  const targets = handles.length > 0 ? handles : STARTER_HANDLES;

  console.log(`Seeding ${targets.length} rental broker(s)…`);
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
