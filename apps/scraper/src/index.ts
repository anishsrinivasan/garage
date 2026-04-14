import { eq, and } from "drizzle-orm";
import { db, dealerSources, garages } from "@preowned-cars/db";
import { createInstagramAdapter } from "./adapters/instagram";
import { createCars24Adapter } from "./adapters/cars24";
import { createCardekhoAdapter } from "./adapters/cardekho";
import { createOlxAdapter } from "./adapters/olx";
import { runAdapter } from "./runner";

async function fetchDealers(platform: string): Promise<
  Array<{
    dealerSourceId: string;
    garageId: string;
    handle: string;
    displayName: string | null;
    city: string | null;
  }>
> {
  const rows = await db
    .select({
      dealerSourceId: dealerSources.id,
      garageId: dealerSources.garageId,
      handle: dealerSources.handle,
      displayName: garages.name,
      city: garages.city,
    })
    .from(dealerSources)
    .innerJoin(garages, eq(garages.id, dealerSources.garageId))
    .where(
      and(
        eq(dealerSources.platform, platform),
        eq(dealerSources.isActive, true),
        eq(garages.isActive, true),
      ),
    );
  return rows;
}

const SOURCE_FLAG = "--source";

async function main() {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf(SOURCE_FLAG);
  const source = sourceIdx !== -1 ? args[sourceIdx + 1] : "all";

  const adapters = [];

  if (source === "instagram" || source === "all") {
    const dealers = await fetchDealers("instagram");
    if (dealers.length === 0) {
      console.warn("[main] No active Instagram handles in dealer_sources table — skipping Instagram scraper");
    } else {
      adapters.push(createInstagramAdapter(dealers));
    }
  }

  if (source === "cars24" || source === "all") {
    adapters.push(createCars24Adapter());
  }

  if (source === "cardekho" || source === "all") {
    adapters.push(createCardekhoAdapter());
  }

  if (source === "olx" || source === "all") {
    // adapters.push(createOlxAdapter());
  }

  if (adapters.length === 0) {
    console.error(`Unknown source: ${source}`);
    process.exit(1);
  }

  for (const adapter of adapters) {
    await runAdapter(adapter);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
