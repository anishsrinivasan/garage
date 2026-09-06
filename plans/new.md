# Torque — Improvement Plan

**Status:** proposal, awaiting approval
**Scope:** Phase 1–4 = fix `apps/web` + the scraper. Phase 5 = new `apps/admin`.
**Date:** 2026-09-06

Everything in "Findings" below was verified against the live PlanetScale DB, the
source, and by downloading the actual R2 images — not inferred.

---

## 0. Findings (verified)

### 0.1 Why a 16-week-old car is the first card

Three independent causes stack up:

1. **The default sort is effectively price-first.** `getListings()` in
   `apps/web/src/app/lib/queries.ts:120-131` builds a "Featured" order of
   `available → has-media → premium-brand → **price DESC** → scrapedAt DESC`.
   Price outranks recency by two positions, so the single most expensive row in
   the table is permanently pinned to slot #1 regardless of age.
2. **That top row's price is a 10× parse error.** The `tn33cars_` BMW M340i
   caption literally reads `₹ 45 Lakhs`; we stored `45,000,000` (₹4.50 Cr).
   Same bug on the Toyota Fortuner: `36 Lakhs` → `36,000,000` (₹3.60 Cr). Both
   pass `validateListing` because the allowed band is ₹10k–₹10 Cr.
3. **Nothing ever expires.** `is_active` is set to `true` on insert and on
   conflict and is *never* set to `false` anywhere in the codebase. All 500 rows
   are active. There is no delist sweep, no "last seen" check, no age cap.

Aggravating context: the last *successful* Instagram run was **2026-05-22**; the
2026-09-06 run is recorded as `failed`. The Instagram half of the catalogue is
~15 weeks stale, while the hero banner claims "AI-curated · Updated hourly".

`listed_at` only exists for Instagram (319/500 rows). `cars24.ts` and
`cardekho.ts` never set it, so 181 rows have `listed_at = NULL` — a date-aware
sort needs a coalesced fallback, not a raw column sort.

### 0.2 Why the images are wrong

`extractPostImageUrls()` (`apps/scraper/src/adapters/instagram.ts:151-239`)
regex-scans the **entire post page HTML** for any `cdninstagram|fbcdn` URL. An
Instagram post page also embeds "More posts from this account" and suggested-post
thumbnails, so the media array gets images of *other cars*.

Verified: `kun_elite` reel `DW8sTW5Do1S` is a **BMW X7**, but `media[4]`
(`.../DW8sTW5Do1S/4.jpeg`) is a photo of **two BMW 7 Series**. Every one of the
319 Instagram rows has exactly 8 media items — i.e. the `maxImagesPerPost: 8` cap
is being *filled* with page scrapings, not with the post's real carousel.

The play button is **baked into the pixels**. `media[0]` for that reel is IG's
cover thumbnail with a white play triangle rendered into the JPEG (confirmed by
downloading it). It is not a UI overlay we can turn off. The cover frame is
whatever IG picked — frequently the dealer talking to camera, not the car.

`og:video` is never captured: `has_video = 0` across all 500 rows. So reels store
zero video, and `MediaFrame`'s `<video>` branch in the detail page is dead code.

Instagram media is 9:16 (`360×640`, `540×960`, `640×1138`) rendered into a 4:3
card — heavy centre-crop on top of a badly-chosen frame.

CarDekho contributes **111 listings with zero media**, which is every "No
preview" tile on the grid.

### 0.3 Data quality (live counts)

| Problem | Evidence |
|---|---|
| Fuel casing not normalised | `diesel` 150 / `Diesel` 33, `petrol` 131 / `Petrol` 147, `CNG` 1 |
| Transmission casing | `automatic` 177 / `Automatic` 53, `Manual` 128 / `manual` 42 |
| Body casing | `suv` 150 / `SUV` 23, `sedan` 118 / `Sedan` 12, `hatchback` 24 / `Hatchback` 35 |
| Make not canonical | `Maruti` 46 vs `Maruti Suzuki` 10; `Kia` 13 / `KIA` 4; `Mini` 3 / `MINI` 4; `Mercedes-Benz` 53 / `Mercedes Benz` 4 |
| Model not canonical | `M340i` vs `M340I` |
| Dedupe never implemented | `content_hash` + `dedup_cluster_id` columns exist, unused. BMW X7 2024 appears **6×**, Land Rover Defender 2025 3×, Rolls-Royce Ghost 2017 3× |
| Price-on-request invisible | 155 of 482 available listings (32%) have `price = NULL` |
| Missing specs | 100 rows no transmission, 111 no body type, 131 no variant |

That casing split is exactly what the screenshot shows: `All · CNG · Diesel ·
Diesel · Electric · Hybrid · Petrol · Petrol`. `getFilterOptions()` uses
`selectDistinctOn` on the raw column and the pills `capitalize` on render, so the
same value renders twice and clicking one silently excludes the other's rows.

### 0.4 Web app issues

- **Search fires a full navigation per keystroke.** `filters.tsx:51` calls
  `update()` on every `onChange`; `update()` does `router.push`. Typing "creta"
  = 5 RSC round-trips + 5 DB queries. No debounce.
- **Zero caching.** `export const dynamic = "force-dynamic"` on `/` and
  `/listings/[id]`. `getFilterOptions()` runs 5 `SELECT DISTINCT` queries on
  every single page view, for data that changes once per scrape.
- **`next/image` is never used**, despite `remotePatterns` being configured. Raw
  `<img>` serves ~1 MB 9:16 originals into ~400 px cards — no AVIF/WebP, no
  responsive `srcset`, no LCP priority hint, no blur placeholder.
- **`Suspense` wraps the wrong things** — `Filters` and `Pagination` (neither
  fetches), not the results grid. There is no skeleton, no `loading.tsx`, no
  `error.tsx`.
- **No date on the card at all** (your ask) and no freshness filter.
- **Pagination is prev/next only** — 21 pages means 20 clicks to reach the end.
- **Detail page shows "Scraped"** as a user-facing spec (internal jargon) and
  "Listed —" for the 181 rows without `listed_at`.
- **`userScalable: false` + `maximumScale: 1`** in `layout.tsx:94-95` blocks
  pinch-zoom — a WCAG 1.4.4 failure.
- **Sitemap omits all 500 listing pages** (`sitemap.ts` only emits `/`,
  `/garages`, `/garages/[slug]`) and there is no JSON-LD on detail pages.
- Dead nav: "Insights" and "Get alerts" are permanently disabled `<span>`s.
- The City dropdown offers exactly one city (Chennai) and the hero shows
  "CITIES 1".

---

## Phase 1 — Ranking, freshness, and dates

**1.1 Replace price-weighted "Featured" with a recency-decayed relevance score.**
New default order computed in SQL:

```
score = brand_weight × media_weight × completeness_weight × exp(-age_days / HALF_LIFE)
age_days = now() - coalesce(listed_at, scraped_at)
```

with `HALF_LIFE ≈ 21 days`, sold listings hard-pushed to the bottom, and price
demoted from a sort key to a *tie-breaker within the same freshness band*. Net
effect: a 4-day-old ₹18 L Creta outranks a 16-week-old ₹99 L X7, which is what
you asked for. Constants live in one exported config object so they're tunable
without touching query code.

**1.2 Add `first_seen_at`, `last_seen_at`, `delisted_at` to `car_listings`.**
`scraped_at` is currently doing double duty and is ambiguous. Backfill
`first_seen_at = scraped_at`, `last_seen_at = updated_at`.

**1.3 Delisting sweep.** After each adapter run, mark listings from that source
that were expected but not seen as `is_active = false, delisted_at = now()`.
Plus a scheduled hard rule: anything not re-confirmed in `STALE_DAYS` (default
45) drops off the default feed but stays reachable by direct URL. This is the
real fix for "not sure if the car will even be present".

**1.4 Backfill `listed_at` for marketplace sources.** Parse the listing date from
Cars24/CarDekho JSON-LD where present; otherwise set `listed_at = first_seen_at`
so the sort has a sane value for all 500 rows instead of 319.

**1.5 Surface the date in the UI.**
- Card: a relative-age chip — `Today` / `3d ago` / `2w ago` / `3mo ago`, colour-
  coded (green ≤ 7d, neutral ≤ 30d, amber ≤ 90d, red beyond).
- A `Freshness` filter: `Last 24h · 7 days · 30 days · 90 days · Any`.
- A `Recently listed` sort option backed by `coalesce(listed_at, first_seen_at)`.
- Detail page: replace the "Scraped" spec with `Listed` + `Last confirmed`, and
  show a "This listing hasn't been confirmed in N weeks — verify with the
  dealer" banner past the stale threshold.

**1.6 Fix the false "Updated hourly" claim** — render the real timestamp of the
most recent successful `scrape_runs` row instead.

---

## Phase 2 — Scraper: media, price, normalisation

**2.1 Scope image extraction to the actual post.** Stop regexing the whole page.
Read the post's own carousel via IG's embedded JSON payload
(`xdt_api__v1__media__shortcode__web_info` / the `PolarisPostRoot` blob), falling
back to `og:image` + only those `<img>` inside the post's `<article>`/`role=
dialog` subtree. Drop the blind HTML regex. This alone kills the "other car's
photo" bug.

**2.2 Capture reel video and pick a real cover frame.** For `/reel/` posts,
resolve the `video_url` from the same JSON payload, download it, and use
`ffmpeg` to extract candidate frames (e.g. at 10/30/50/70/90% of duration).
Store the video in R2 alongside the frames so playback stops depending on
Instagram's expiring signed CDN URLs.

**2.3 LLM-score frames and images for a car-forward hero.** One cheap
Gemini-Flash vision pass per post scores each candidate 0–100 on: full car
visible, exterior 3/4 or front view, car occupies most of frame, no person
dominating, no baked-in play button, no text overlay covering the car. Highest
scorer becomes `media[0]`; the rest are ordered by score. This is the direct fix
for "shows a person talking instead of the car". Cost is a handful of images per
post on top of an extraction call we already make.

**2.4 Prefer clean frames over IG's play-button thumbnail.** Deprioritise any
image whose top-centre region matches IG's baked play glyph, and prefer real
carousel photos over the cover thumbnail when both exist.

**2.5 Fix the lakh/crore price bug.** Three layers:
- Tighten the LLM prompt with worked examples for `45 Lakhs`, `₹45L`, `45.5L`,
  `1.2 Cr`.
- A deterministic post-check: re-parse the caption with `parseIndianPrice()`; if
  the LLM value and the regex value differ by exactly 10× or 100×, take the
  regex value. (Also fix `parseIndianPrice` — it tests `lakh` before `cr` on a
  string with whitespace already stripped, so `"1.2 Cr"` works but `"45Lakhs"`
  and `"45 L"` do not.)
- A plausibility band per segment (a `M340i` above ₹1.5 Cr is rejected for
  review, not silently stored).
- One-off repair pass over the 2 known bad rows.

**2.6 Normalise enums and makes at write time.** A shared
`packages/shared/src/normalize.ts` with lowercase canonical `fuelType`,
`transmission`, `bodyType`, plus a make/model alias map (`Maruti` → `Maruti
Suzuki`, `KIA` → `Kia`, `MINI` → `Mini`, `Mercedes Benz` → `Mercedes-Benz`,
`M340I` → `M340i`). Applied in `runner.ts` before upsert **and** as a one-off
backfill migration, so the duplicate filter pills disappear for existing rows
too.

**2.7 Implement the dedupe that the schema already anticipates.** Populate
`dedup_cluster_id` by grouping on
`(normalised make, model, year, km ±2%, garage_id)`, keeping the freshest/
best-media row as cluster head and collapsing the rest behind a "3 posts from
this dealer" affordance. Kills the BMW X7 2024 ×6 repetition.

**2.8 CarDekho media.** 111/111 rows have none — fix the image extraction there
so those cards stop rendering as "No preview".

**2.9 Make the failing Instagram run observable.** The 2026-09-06 run failed
silently. Persist the error, and surface run health in the admin dashboard
(Phase 5).

---

## Phase 3 — Web UI/UX

**3.1 Debounce search** (300 ms) and switch filter navigation to
`router.replace` with `scroll: false` so filtering doesn't spam history.

**3.2 Cache what doesn't change per-request.** Wrap `getFilterOptions()` in
`unstable_cache` with a `filters` tag; move `/` off `force-dynamic` to a short
`revalidate` with tag-based invalidation triggered at the end of a scrape run.

**3.3 Adopt `next/image`** with correct `sizes`, `priority` on the first row, and
a blur placeholder. R2 is already on a public domain, so this is a drop-in.

**3.4 Card redesign.**
- Aspect ratio to 3:2 with `object-cover` and a top-biased focal point (cars sit
  high in 9:16 frames).
- Add the relative-date chip (1.5) and a garage/dealer name line — right now you
  cannot tell *who* is selling without opening the listing.
- Show `Price on request` as a legible state rather than an empty-looking chip
  (32% of listings).
- Hover-cycle through the first 3 images.
- Make the bookmark button always visible on touch devices (it is
  `opacity-0` until `group-hover`, so it is unreachable on mobile).

**3.4b Correct `Suspense` boundaries** — wrap the results grid, add a card
skeleton, add `loading.tsx` and `error.tsx`.

**3.5 Filters panel.**
- De-duplicated, normalised options (from 2.6) with per-option result counts.
- Price as a slider with Indian shorthand (₹5 L / ₹1 Cr), not two bare number
  inputs.
- Make/model as a dependent picker instead of free-text search only.
- Add Garage and Freshness filters.
- Persist filters in the URL (already) and add named "Saved searches" in
  localStorage.

**3.6 Pagination** → numbered pages with first/last, or infinite scroll with a
"load more" fallback. Switch to keyset pagination for the sorted feed to stay
fast past a few thousand rows.

**3.7 Listing detail.**
- Real gallery: lightbox, keyboard nav, swipe, inline reel playback (once 2.2
  stores video).
- "Listed / Last confirmed" (1.5) and the stale banner.
- Dealer card linking to the garage page + a WhatsApp deep link on the phone
  number (271 of 319 IG listings have a phone).
- "Similar cars" strip — same model, or same garage.

**3.8 Accessibility & SEO.**
- Drop `userScalable: false` / `maximumScale: 1`.
- Descriptive `alt` text (`2023 BMW X7 xDrive40i M Sport, Chennai`).
- `Vehicle` + `Offer` JSON-LD on detail pages.
- Add all active listing URLs to the sitemap.

**3.9 Honest empty/dead states.** Either ship "Insights" and "Get alerts" or
remove them; hide the City filter and the "Cities 1" stat while there is only
one city.

---

## Phase 4 — Operational hardening

- **Scheduled scrapes** (GitHub Actions cron or a Vercel cron hitting a
  protected route) so the catalogue can't go 15 weeks stale again.
- **Scrape health alerting** on `failed` / `completed_with_errors` runs.
- **Instagram session refresh** — the login flow is manual today; the failed run
  is most likely an expired `storage-state.json`.
- **Cost tracking** — `llm_usage_logs` has 195 rows and nothing reads it.

---

## Phase 5 — `apps/admin` (after Phases 1–3 land)

New Turborepo app, Next.js 15 App Router, same Tailwind design tokens, deployed
separately (`admin.<domain>`), `noindex`.

**Auth:** `better-auth` with the Drizzle adapter, **email + password only**, no
public sign-up (users seeded via a CLI script). Session cookies, middleware-
guarded routes, `auth` tables in a separate `torque_admin` Postgres schema.

**Screens:**

1. **Dashboard** — active/stale/sold counts, listings added per day, last run per
   source with status, open reports, LLM spend from `llm_usage_logs`.
2. **Listings** — table with every filter, inline edit of price/specs/status,
   bulk activate/deactivate, "promote/demote" pin, delete, media reorder and
   hero-image override (so you can fix a bad cover by hand in seconds), and a
   **review queue** for listings the price-plausibility check flagged.
3. **Garages** — full CRUD: name, slug, city, phone, logo, description, socials.
4. **Add garage via Instagram** — paste a handle → we fetch the profile
   (name, bio, avatar, follower count), preview the last N posts, let you confirm,
   then create `garages` + `dealer_sources` rows and optionally kick off a first
   scrape immediately. This is the "add more garages through Instagram" flow.
5. **Sources & runs** — toggle `dealer_sources`, per-source config
   (posts per account, recheck window), trigger a run on demand, tail run logs.
6. **Moderation inbox** — `listing_reports` and `feedback` with status
   transitions.
7. **Data quality** — surfaces the normalisation and dedupe outliers so you can
   fix the long tail by hand.

Shared code moves to `packages/db` (schema) and a new `packages/ui` for the
primitives both apps use.

---

## Suggested execution order

| Step | Work | Impact |
|---|---|---|
| 1 | 1.1 ranking + 1.5 date chip + 2.5 price fix | Fixes the front page today |
| 2 | 2.6 normalisation + backfill | Kills duplicate filter pills |
| 3 | 2.1–2.4 media pipeline | Fixes wrong/person-talking images |
| 4 | 1.2–1.4 freshness columns + delist sweep | Listings stop going stale silently |
| 5 | 3.1–3.4 perf + card redesign | Speed and polish |
| 6 | 2.7 dedupe, 3.5–3.9 filters/detail/SEO | Depth |
| 7 | Phase 4 scheduling | Keeps it fresh automatically |
| 8 | Phase 5 admin app | Control plane |

Steps 1–3 are the ones that directly answer what you flagged; I'd ship those
first and get them in front of you before continuing.
