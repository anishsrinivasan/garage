# Torque

A curated, deduplicated feed of preowned car listings in India, gathered from
Cars24, CarDekho, and Instagram dealers.

```
apps/
  web       Public site (Next.js App Router)
  admin     Internal dashboard (Next.js + better-auth)   → apps/admin/README.md
  cron      Scraper scheduler (Hono, runs on the homelab) → apps/cron/README.md
  scraper   Adapters, extraction, dedupe, delisting
packages/
  db        Drizzle schema + migrations (Postgres, `torque` schema)
  shared    Types, normalisation, price parsing, ranking policy
```

Bun workspaces + Turborepo. `bun install`, then `cp .env.example .env`.

## Running things

```bash
bun run dev:web            # public site        :3000
bun run dev:admin          # admin dashboard    :3001
bun run dev:cron           # scheduler API      :3333

bun run scrape                                  # every source
bun run scrape:instagram                        # one source
bun run scrape -- --source instagram --handles kun_elite
bun run scrape:maintenance                      # delist sweep + dedupe

bun run db:migrate         # apply migrations
bun run admin:create-user  # seed an admin account
```

The Instagram adapter needs a logged-in session:

```bash
bun run apps/scraper/src/instagram-login.ts
```

It also needs Playwright's Chromium (`bunx playwright install chromium`) and,
for reel frame extraction, `ffmpeg`. Both are baked into the cron image.

## How the feed is ordered

The default order is a **recency-decayed quality score**, not a sort key list:

```
score = exp(-age_days / 21) × brand × media × price × completeness × penalties
age   = now − coalesce(listed_at, first_seen_at)
```

Price is only a tie-breaker. The previous ordering put `price DESC` above
recency, which pinned the single most expensive row in the table to the top of
the home page permanently — a sixteen-week-old listing whose price was also a
10× lakh/crore parse error.

`packages/shared/src/ranking.ts` holds every constant.

## Freshness, and why a broken scraper can't empty the site

`is_active` used to be set `true` on insert and on conflict and never set
`false` anywhere, so nothing ever left the catalogue.

Now:

- `first_seen_at` / `last_seen_at` / `delisted_at` replace the overloaded
  `scraped_at`.
- After each run, listings the source should have produced but didn't are
  delisted — **unless** the run covered less than half the source's active
  listings, which reads as a degraded run rather than a sold-out dealer.
- An hourly age sweep retires anything not re-confirmed in 45 days — **unless**
  that source has had no successful run since those listings were last
  confirmed. Without this guard the first sweep retired 460 of 500 listings,
  every Instagram row included, purely because the Instagram scraper was
  failing. A broken scraper must never be able to empty the catalogue.
- Delisting is soft: the row keeps its URL and comes back if a later scrape
  sees the car again.

## Media

Instagram post media comes from the post's own embedded GraphQL payload, not
from scanning the page HTML — the page also embeds the "more posts" rail, which
is how listings ended up carrying photos of other cars.

For reels we download the mp4 to R2 and cut our own frames with ffmpeg, then
score every candidate image with a vision pass and store the media hero-first.
Instagram's reel cover frame has a play triangle burned into the pixels and is
usually the dealer talking rather than the car, so it is explicitly penalised.
The admin can override the hero with one click.

## Data hygiene

- Enums are stored lowercase and makes/models canonicalised on write
  (`packages/shared/src/normalize.ts`), so the filter sidebar can't grow a
  second "Diesel" pill again.
- LLM prices are cross-checked against the source caption; a clean
  power-of-ten disagreement is resolved in the caption's favour, and an
  implausible price is flagged for review rather than silently stored.
- Reposts of the same car are clustered, and only the cluster head reaches the
  feed.
