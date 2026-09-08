/**
 * Finds candidate Instagram accounts through Apify's hashtag scraper.
 *
 *   APIFY_TOKEN=... bun run apps/scraper/src/apify-discover.ts \
 *     --tags chennairent,chennaihouseforrent --vertical rentals --limit 200
 *
 * Discovery is the gap this fills. Everything else in the scraper reads handles
 * that are already in `dealer_sources`; nothing finds new ones, so every broker
 * has been added by hand. That ceiling is the real constraint on the rentals
 * catalogue — six brokers — and no amount of scraping reliability lifts it.
 *
 * It only ever *suggests*. Handles are printed for a human to look at, not
 * written to the database: the last time accounts were added without a person
 * checking, four of five did not exist. `seed-rental-brokers.ts` remains the
 * way in, deliberately.
 *
 * Apify's own scraper is used rather than ours because ours would have to
 * browse Instagram's hashtag pages while logged in, which is exactly the
 * behaviour that gets a session checkpointed. At $0.0026 a result, scanning a
 * few hundred posts a month costs about a dollar.
 */

import { db, dealerSources } from "@classifieds/db";

const ACTOR = "apify~instagram-hashtag-scraper";
const ENDPOINT = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

type HashtagPost = {
  ownerUsername?: string;
  ownerFullName?: string;
  caption?: string;
  url?: string;
  likesCount?: number;
  timestamp?: string;
};

async function main() {
  const args = process.argv.slice(2);
  const tags = (flag(args, "--tags") ?? "chennairent,chennaihouseforrent,chennaiproperty")
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
  const limit = Number(flag(args, "--limit") ?? 100);
  const vertical = flag(args, "--vertical") ?? "rentals";

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error(
      "APIFY_TOKEN is not set.\n\n" +
        "Apify refuses anonymous runs — the API answers 402 with\n" +
        '  "x402 payment header missing. Add your PAYMENT-SIGNATURE or Apify token"\n' +
        "so there is no way to try this without one. Create a token at\n" +
        "https://console.apify.com/account/integrations and put it in .env as\n" +
        "  APIFY_TOKEN=...",
    );
    process.exit(1);
  }

  console.log(`[discover] ${tags.map((t) => "#" + t).join(", ")} — up to ${limit} post(s)`);

  const res = await fetch(`${ENDPOINT}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hashtags: tags, resultsLimit: limit }),
  });

  if (!res.ok) {
    console.error(`[discover] Apify returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }

  const posts = (await res.json()) as HashtagPost[];
  console.log(`[discover] ${posts.length} post(s) returned`);

  // One row per account, with enough context for a person to judge it.
  const byAccount = new Map<
    string,
    { name: string | null; posts: number; newest: string | null; sample: string }
  >();
  for (const p of posts) {
    const handle = p.ownerUsername?.trim().toLowerCase();
    if (!handle) continue;
    const seen = byAccount.get(handle);
    const caption = (p.caption ?? "").replace(/\s+/g, " ").slice(0, 70);
    if (seen) {
      seen.posts += 1;
      if (p.timestamp && (!seen.newest || p.timestamp > seen.newest)) seen.newest = p.timestamp;
    } else {
      byAccount.set(handle, {
        name: p.ownerFullName ?? null,
        posts: 1,
        newest: p.timestamp ?? null,
        sample: caption,
      });
    }
  }

  const known = new Set(
    (await db.select({ handle: dealerSources.handle }).from(dealerSources)).map((r) =>
      r.handle.toLowerCase(),
    ),
  );

  const candidates = [...byAccount.entries()]
    .filter(([handle]) => !known.has(handle))
    .sort((a, b) => b[1].posts - a[1].posts);

  console.log(
    `\n${candidates.length} account(s) not already tracked, most prolific first:\n`,
  );
  for (const [handle, info] of candidates) {
    const when = info.newest ? info.newest.slice(0, 10) : "unknown";
    console.log(`  @${handle}`);
    console.log(`    ${info.posts} post(s), newest ${when}${info.name ? ` — ${info.name}` : ""}`);
    if (info.sample) console.log(`    "${info.sample}"`);
  }

  console.log(
    "\nNothing has been written. Check the accounts look like real brokers, then:\n" +
      `  bun run apps/scraper/src/seed-${vertical === "rentals" ? "rental-brokers" : "dealers"}.ts <handle> [handle ...]`,
  );
  process.exit(0);
}

void main();
