/**
 * Sets gatedCommunity on rentals whose caption already says so.
 *
 * The attribute is new; the sentence is not. Eleven listings said "gated
 * community" in their description long before there was a column to put it in,
 * and re-extracting every rental through the model to recover a fact that is
 * sitting in plain text would cost tokens to learn nothing.
 *
 * Only ever sets true. A caption that does not mention it is silent, not a
 * denial, and the column stays null — see the note on the schema.
 *
 *   bun run apps/scraper/src/backfill-gated.ts          # report
 *   bun run apps/scraper/src/backfill-gated.ts --apply  # write
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, listings, listingRentalAttrs } from "@classifieds/db";

const APPLY = process.argv.includes("--apply");

/**
 * Deliberately narrow. "gated" alone catches "gated parking" and "gate", and a
 * security guard or a compound wall is not a gated community — the same line
 * the extraction prompt draws, so the backfill and the model agree.
 */
const GATED = /\bgated\s+(community|complex|enclave|society|compound|apartment|apartments|villa|villas|layout)\b|\bgated\s*&\s*secure\b|\binside\s+a\s+gated\b/i;

async function main() {
  const rows = await db
    .select({
      id: listings.id,
      description: listings.description,
      gated: listingRentalAttrs.gatedCommunity,
    })
    .from(listings)
    .innerJoin(listingRentalAttrs, eq(listingRentalAttrs.listingId, listings.id))
    .where(and(eq(listings.vertical, "rentals"), isNull(listingRentalAttrs.gatedCommunity)));

  const hits = rows.filter((r) => r.description && GATED.test(r.description));

  for (const row of hits) {
    if (APPLY) {
      await db
        .update(listingRentalAttrs)
        .set({ gatedCommunity: true })
        .where(eq(listingRentalAttrs.listingId, row.id));
    }
  }

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(listingRentalAttrs)
    .where(eq(listingRentalAttrs.gatedCommunity, true));

  console.log(
    `${rows.length} rental(s) with no value; ${hits.length} say gated community in the caption.`,
  );
  console.log(APPLY ? `Applied. ${total} rental(s) now flagged.` : "Dry run — pass --apply.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
