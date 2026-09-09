/**
 * Creates a saved search, which is what an alert actually is.
 *
 * The delivery pipeline has been complete for a while — `evaluateAlerts` queues
 * matches after every scrape and the hourly maintenance job sends the digests —
 * but nothing could create the row it all keys off, so it had never fired. This
 * is that missing step. There is no UI yet; when there is, it should call the
 * same code.
 *
 *   bun run apps/scraper/src/create-alert.ts \
 *     --label "2BHK Adyar under 40k" --vertical rentals \
 *     --email you@example.com --filters '{"bhk":[2],"maxRent":40000}'
 *
 *   bun run apps/scraper/src/create-alert.ts \
 *     --label "Cheap hatchbacks" --vertical cars \
 *     --telegram 12345678 --filters '{"maxPrice":500000}'
 */

import { randomBytes } from "node:crypto";
import { db, savedSearches } from "@classifieds/db";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

/**
 * Keys `matchesFilters` understands. Anything else is ignored at match time, so
 * a typo would silently produce an alert that never fires — better to refuse it
 * here than to let someone wait a week for a digest that cannot arrive.
 */
const KNOWN_FILTERS = new Set([
  "minPrice", "maxPrice", "minRent", "maxRent",
  "locality", "bhk", "furnishing", "propertyType", "fuelType", "bodyType",
]);

async function main() {
  const args = process.argv.slice(2);
  const label = flag(args, "--label");
  const vertical = flag(args, "--vertical") ?? "rentals";
  const email = flag(args, "--email") ?? null;
  const telegram = flag(args, "--telegram") ?? null;
  const rawFilters = flag(args, "--filters") ?? "{}";
  const interval = Number(flag(args, "--interval") ?? 60);

  if (!label) {
    console.error('Usage: --label "…" --vertical cars|rentals (--email … | --telegram …) --filters \'{"maxRent":40000}\'');
    process.exit(1);
  }
  if (!email && !telegram) {
    console.error("One of --email or --telegram is required — an alert with no channel can never be delivered.");
    process.exit(1);
  }
  if (vertical !== "cars" && vertical !== "rentals") {
    console.error(`--vertical must be "cars" or "rentals", got "${vertical}"`);
    process.exit(1);
  }

  let filters: Record<string, unknown>;
  try {
    filters = JSON.parse(rawFilters) as Record<string, unknown>;
  } catch {
    console.error(`--filters is not valid JSON: ${rawFilters}`);
    process.exit(1);
  }

  const unknown = Object.keys(filters).filter((k) => !KNOWN_FILTERS.has(k));
  if (unknown.length > 0) {
    console.error(
      `Unknown filter(s): ${unknown.join(", ")}\nMatching understands: ${[...KNOWN_FILTERS].join(", ")}`,
    );
    process.exit(1);
  }

  const channels = [email ? "email" : null, telegram ? "telegram" : null].filter(
    Boolean,
  ) as string[];

  const [row] = await db
    .insert(savedSearches)
    .values({
      label,
      vertical,
      email,
      telegramChatId: telegram,
      filters,
      channels,
      minIntervalMinutes: Number.isFinite(interval) ? interval : 60,
      isActive: true,
      unsubscribeToken: randomBytes(24).toString("hex"),
    })
    .returning({ id: savedSearches.id });

  console.log(`Created alert "${label}" (${row!.id})`);
  console.log(`  vertical : ${vertical}`);
  console.log(`  channels : ${channels.join(", ")}`);
  console.log(`  filters  : ${JSON.stringify(filters)}`);
  console.log(`  digest   : at most one message every ${interval} minutes`);
  console.log(
    "\nMatches are queued after each scrape and sent by the hourly maintenance job.",
  );
  process.exit(0);
}

void main();
