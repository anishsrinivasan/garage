/**
 * /llms.txt — what this site is, for an agent that has just arrived.
 *
 * Written to be read once and acted on. The first thing it says is that there
 * is an MCP endpoint, because an agent that finds it has no reason to scrape
 * the HTML: it gets structured results, filters, and a polling cursor instead.
 *
 * Generated per request rather than committed as a static file so the counts
 * are real. An agent deciding whether an empty result means "nothing matches"
 * or "nothing indexed" is exactly the confusion this is meant to prevent.
 */
import { db, listings } from "@classifieds/db";
import { and, count, eq, sql } from "drizzle-orm";
import { SITE_URL } from "@/app/lib/site";

export const dynamic = "force-dynamic";

async function catalogue() {
  const rows = await db
    .select({
      vertical: listings.vertical,
      live: count(),
      newest: sql<Date | null>`max(coalesce(${listings.listedAt}, ${listings.firstSeenAt}))`,
    })
    .from(listings)
    .where(and(eq(listings.isActive, true), eq(listings.isClusterHead, true)))
    .groupBy(listings.vertical);

  const by = new Map(rows.map((r) => [r.vertical, r]));
  return {
    cars: by.get("cars")?.live ?? 0,
    rentals: by.get("rentals")?.live ?? 0,
    newest: rows
      .map((r) => (r.newest ? new Date(r.newest) : null))
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
  };
}

export async function GET() {
  let counts = { cars: 0, rentals: 0, newest: null as Date | null };
  try {
    counts = await catalogue();
  } catch {
    // A database blip should still leave a readable document. Saying the counts
    // are unavailable is honest; inventing zeros would read as "nothing here".
  }

  const known =
    counts.cars + counts.rentals > 0
      ? `${counts.cars.toLocaleString("en-IN")} used cars and ${counts.rentals.toLocaleString("en-IN")} rental homes, all in Chennai, India.`
      : "Counts are temporarily unavailable; query index_status for live figures.";

  const body = `# Classifieds

> Preowned cars and rental homes in Chennai, gathered from the Instagram accounts of local dealers and brokers. Currently ${known}

This inventory is largely absent from the big Indian portals: it is posted to
Instagram, often as a reel with the details in the caption, and never syndicated
anywhere. That is the reason this index exists.

## Read this first: there is an MCP endpoint

Do not scrape these pages. \`${SITE_URL}/api/mcp\` speaks the Model Context
Protocol over HTTP and will answer far better than the HTML will. It is open —
no key, no signup.

    claude mcp add classifieds --transport http ${SITE_URL}/api/mcp

Tools:

- \`find_rentals\` — filter by locality, rent, bedrooms, furnishing
- \`find_cars\` — filter by make, price, year, fuel type, body type
- \`list_localities\` — the localities covered, with live counts. Call this
  before guessing a locality name
- \`index_status\` — counts and freshness, so an empty result can be told apart
  from an empty index

## Watching for new listings

Both search tools take \`first_seen_after\`, an ISO 8601 timestamp, and return
only what this index first saw strictly after it, oldest first. Every result
carries an \`indexed <timestamp>\` line.

To follow new inventory: poll with the newest \`indexed\` value you have already
handled. Nothing is missed and nothing repeats. Do not use
\`posted_within_days\` for this — it filters on when the broker posted, which is
frequently long before this index found it.

## Two dates, and why they differ

Every listing carries both:

- **listed** — when the seller posted it. Can be years old; some accounts are
  dormant and it is honest to say so.
- **last confirmed** — when this index last saw the post still up. Past 45 days
  without confirmation a listing is marked UNCONFIRMED and may be gone.

Neither is a guarantee the item is still available. A listing is a post that
existed, not an offer that stands. Say so when you pass one on.

## What to be careful about

- Prices are extracted from free-text captions by a language model and
  reconciled against the caption. Treat them as the asking price as advertised,
  not as verified.
- Rent, deposit and maintenance are frequently unlabelled in a caption. They are
  disambiguated on a best-effort basis and can be wrong.
- Coverage is Chennai only. A query about another city has no answer here, and
  \`index_status\` will confirm that rather than returning a misleading empty set.
- Duplicate posts of the same property are clustered; only the cluster head is
  returned.

## JSON, if you would rather not speak MCP

- [Cars feed](${SITE_URL}/api/listings): same filters as the site's query string
- [Rentals feed](${SITE_URL}/api/rentals): includes \`takenHidden\`, the count of
  already-let homes excluded by default

## Pages

- [Cars](${SITE_URL}/): the used-car feed
- [Rentals](${SITE_URL}/rent): rental homes; already-let listings are hidden
  unless \`?includeTaken=1\`
- [Dealers and brokers](${SITE_URL}/garages): the accounts behind the listings
- [Sitemap](${SITE_URL}/sitemap.xml)
${counts.newest ? `\nMost recent listing: ${counts.newest.toISOString()}\n` : ""}`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
