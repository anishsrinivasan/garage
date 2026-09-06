# Torque — Improvement Plan

**Status:** delivered. See "What shipped" for the outcome of each item and
"Verified against live data" for what was measured rather than assumed.
**Date:** 2026-09-06 → 2026-09-07

---

## 0. Findings (verified before any change)

### 0.1 Why a 16-week-old car was the first card

Three independent causes stacked:

1. **The default sort was effectively price-first.** `getListings()` ordered by
   `available → has-media → premium-brand → **price DESC** → scrapedAt DESC`.
   Price outranked recency by two positions, so the single most expensive row in
   the table was pinned to slot 1 permanently.
2. **That row's price was a 10× parse error.** The caption read `₹ 45 Lakhs`;
   we stored ₹4.50 Cr. Same on a Fortuner (`36 Lakhs` → ₹3.60 Cr). Both passed
   validation because the allowed band was ₹10k–₹10 Cr.
3. **Nothing ever expired.** `is_active` was set `true` on insert and on
   conflict and never set `false` anywhere. All 500 rows were active.

Aggravating: the last *successful* Instagram run was 2026-05-22; the 2026-09-06
run was recorded as `failed`, and its cause turned out to be a missing
Playwright browser binary. The Instagram half of the catalogue was ~15 weeks
stale while the hero claimed "Updated hourly".

### 0.2 Why the images were wrong

`extractPostImageUrls()` regex-scanned the **entire post page HTML** for any
`cdninstagram|fbcdn` URL — which includes the "more posts" rail. Verified: the
`kun_elite` X7 reel's `media[4]` was a photo of two BMW 7 Series. Every Instagram
row had exactly 8 items because the cap was being *filled* with page scrapings.

The play button was **baked into the JPEG pixels** — Instagram's reel cover
frame, not a UI overlay, and usually a frame of the dealer talking. `og:video`
was never captured (`has_video = 0` across all 500 rows).

CarDekho contributed 111 listings with zero media.

### 0.3 Data quality (live counts at the time)

Fuel `diesel` 150 / `Diesel` 33, `petrol` 131 / `Petrol` 147; transmission
`automatic` 177 / `Automatic` 53; body `suv` 150 / `SUV` 23; `Maruti` 46 vs
`Maruti Suzuki` 10; `M340i` vs `M340I`. `dedup_cluster_id` existed and was
unused — BMW X7 2024 appeared 6×. 32% of listings had no price.

### 0.4 Web app

Search fired a full RSC round-trip per keystroke; `force-dynamic` everywhere so
five `SELECT DISTINCT` queries ran per page view; `next/image` never used;
`Suspense` wrapped the two components that don't fetch; no date anywhere on a
card; prev/next-only pagination; `userScalable: false`; no listing URLs in the
sitemap; no structured data.

---

## What shipped

### Ranking and freshness
- Recency-decayed relevance score replacing the price-first order. Price is a
  band multiplier, not a sort key.
- `first_seen_at` / `last_seen_at` / `delisted_at` replacing the overloaded
  `scraped_at`; `listed_at` backfilled for the 181 rows that had none.
- Coverage-guarded per-run delist sweep plus an age sweep.
- Relative-age chips on every card, a "Listed" freshness filter, a "Recently
  listed" sort, and a stale banner on detail pages.
- The hero badge now reports the real last-run time.

### Scraper
- Media read from the post's own embedded GraphQL payload; page-wide scraping
  removed. Also yields untruncated captions and full-resolution images
  (1600×1066 rather than 360×640).
- Reel video downloaded to R2, frames cut with ffmpeg, every candidate scored by
  a vision pass, media stored hero-first. Reel covers explicitly penalised.
- CarDekho lazy-loaded images fixed.
- Prices cross-checked against the caption; implausible ones flagged for review.
- Enums and makes canonicalised on write, with a backfill migration.
- Dedupe implemented — only cluster heads reach the feed.

### Web
Debounced search, tag-based caching with a `/api/revalidate` hook, `next/image`,
3:2 cards showing the selling garage and an "Ask price" state, gallery with
lightbox and keyboard nav, numbered pagination, skeletons, error boundary,
Vehicle JSON-LD, listings in the sitemap, WhatsApp deep links, pinch-zoom
restored, dead nav items removed.

### New apps
- **`apps/cron`** — Hono service with an embedded scheduler, serialised jobs,
  health and status endpoints, token-guarded triggers, Dockerfile with Chromium
  and ffmpeg, and a Dokploy compose file. See `apps/cron/README.md`.
- **`apps/admin`** — better-auth dashboard: listings management, review queue,
  hero-image override, garages CRUD, add-garage-by-Instagram-handle, sources and
  runs, moderation inbox. See `apps/admin/README.md`.

---

## Verified against live data

| Check | Result |
|---|---|
| Enum duplicates after backfill | Gone — one pill per value, with counts |
| The two 10× price errors | Corrected; M340i now ₹45 L, Fortuner ₹36 L |
| Dedupe | 53 repost rows collapsed into 50 clusters |
| Instagram media extraction | 1–8 items matching the real carousel, not a padded 8 |
| Image scoring | Front-three-quarter shots scored 90–95; a collage reel cover scored 30 |
| Reel video | mp4 stored in R2 |
| Delist safety | A 3-listing run correctly refused to sweep |
| Broken-scraper guard | Instagram protected while its scraper was failing |
| Price parser | Every real caption case passes; no false positives |
| Feed ordering | Today's batch ranks 1–20 by price; premium interleaves from 21 |

Two bugs were found *by* this verification and fixed:

1. The age sweep retired 460 of 500 listings on its first real run, because
   `last_seen_at` had been back-filled from `updated_at` and the Instagram
   scraper had been failing. Both the migration and the sweep were changed: a
   listing is only aged out if its source has **successfully scraped since that
   listing was last confirmed**. A broken scraper can no longer empty the site.
2. The initial ranking over-corrected into a pure date sort. Rebalanced with a
   bounded recency floor and price bands.

---

### Found and fixed while verifying

| Problem | Fix |
|---|---|
| Age sweep retired 460 of 500 listings on its first real run | Only age out a listing if its source has successfully scraped since that listing was last confirmed |
| Ranking over-corrected into a pure date sort | Bounded recency floor (0.35) + price-band multiplier |
| `"BMW M340I 3.0L Petrol"` parsed as a ₹3 lakh price | Bare `L`/`k` suffixes now require a currency marker |
| `parseIndianPrice("4500000")` returned null | Comma-grouped regex alternative used `*`, matching only the first three digits |
| CarDekho media still empty after the first fix | `image` is an array of ImageObjects; `String(value)` produced `"[object Object]"` |
| CarDekho fetched the same 20 cars twenty times per run | It paginates client-side; `maxPages` set to 1 |
| `next build` failed without database credentials | DB client and better-auth instance now construct lazily |

## Not done / follow-ups

- **`ffmpeg` is broken on this Mac** (`libjxl.0.11.dylib` missing from the
  Homebrew install), so reel frame extraction degraded to the cover frame
  locally, with a warning. The cron Docker image installs a working ffmpeg, so
  this only affects local runs. `brew reinstall ffmpeg` fixes it.
- The Instagram session at `apps/scraper/.session/storage-state.json` must be
  copied into the cron container's volume before the first scheduled run.
- OLX adapter remains disabled (it was already commented out).
- **CarDekho only yields 20 listings per run** because its pagination is
  client-side. Going deeper needs its XHR endpoint or a headless browser. The
  107 older CarDekho rows still have no photos until a run happens to touch
  them again.
- Keyset pagination — offset pagination is fine at 450 rows, not at 50k.
- Saved searches and price-drop alerts.
