# Build plan — one brand, many verticals

**Status:** approved direction, ready to execute.
**Supersedes the options analysis in** `plans/prd-marketplace.md`.
**Date:** 2026-09-08

---

## 0. Decisions locked

| Decision | Choice | Consequence for the build |
|---|---|---|
| First vertical | **Rentals**, Chennai | Freshness half-life drops to ~7 days |
| Second vertical | **Resale property**, later | Verticals must be pluggable from day one, not retrofitted |
| Brand | **One**, spanning verticals | No per-vertical apps; one shell, vertical-aware routes |
| Geography | Chennai first, **anywhere later** | Cities and localities become real tables now, not text columns |
| Managed scraping | **Undecided** | Build the provider seam; ship the free self-hosted implementation behind it |
| Database | **D1** (from PlanetScale Postgres) | Query layer needs a dialect port; money moves to integer paise |
| Inference | **OpenRouter** | ~30 lines; `resolveModel()` is already a switch |
| Hosting | Workers/Pages for web + admin; **scraper stays on the homelab** | Playwright and ffmpeg cannot run on Workers |
| Alerts | **First-class**, not a phase-5 afterthought | Needs saved searches, a match evaluator and delivery channels |

The scraping row shapes more than it looks. Because the budget is open, the plan
below **does not depend on a paid provider**. We build the interface, implement
the hardened self-hosted path, and leave a managed provider as a one-file drop-in
for whenever you want it.

The infrastructure rows are new and are analysed in §10. Short version: D1 and
OpenRouter are both good calls, but they add roughly a week and change the
sequencing, and one of the four proposals needs correcting.

---

## 1. Brand

`classifieds.ai` reads clearly and says exactly what it is. Two notes before you
buy: `.ai` renews at roughly $70–200/yr, and a generic-word domain is harder to
defend as a mark later.

Worth a look before committing — all short, ownable, and India-native:

- **Chowk** — the public square where a town actually trades. Culturally exact, one syllable, memorable.
- **Kerb** — works for both cars and property ("kerb appeal").
- **Mandi** — market. Same logic as Chowk, slightly more agricultural connotation.

Not a blocker. The codebase uses a placeholder until you decide; nothing below
depends on the name.

---

## 2. Architecture: the vertical contract

Everything vertical-specific lives behind one interface. The pipeline never
branches on vertical; it asks the vertical.

```ts
export interface Vertical<TAttrs> {
  id: "cars" | "rentals" | "resale";
  label: string;

  // ingestion ------------------------------------------------------------
  extractionSchema: ZodType<TAttrs>;      // what the LLM returns per post
  extractionPrompt: string;
  imageScoringPrompt: string;             // "exterior car" vs "interior room"

  // normalisation --------------------------------------------------------
  normalize(raw: TAttrs): TAttrs;
  reconcileMoney(llm: TAttrs, caption: string): MoneyReconciliation<TAttrs>;
  assessPlausibility(attrs: TAttrs): { plausible: boolean; reason: string | null };

  // lifecycle ------------------------------------------------------------
  clusterKey(listing: CoreListing, attrs: TAttrs): string;
  ranking: RankingWeights;                // includes the freshness half-life

  // persistence ----------------------------------------------------------
  persistAttrs(listingId: string, attrs: TAttrs): Promise<void>;
  loadAttrs(listingIds: string[]): Promise<Map<string, TAttrs>>;

  // presentation ---------------------------------------------------------
  title(l: CoreListing, a: TAttrs): string;
  subtitle(l: CoreListing, a: TAttrs): string;
  specs(l: CoreListing, a: TAttrs): Spec[];
  facets: FacetDefinition[];              // drives the filter sidebar
}
```

Two things this buys us:

- **`ai/core.ts` already takes any Zod schema**, so extraction is generic today.
  The only reason it looks car-shaped is the prompt string next to it.
- **Adding resale later is one file** plus an attrs table and a migration.

### What stays shared, untouched

Instagram discovery and media extraction, R2, reel frame cutting, the vision
scoring harness, the freshness lifecycle (first/last seen, coverage-guarded
delisting), the dedupe algorithm, the scheduler, source health, the admin shell,
search, pagination and gallery components.

---

## 3. Data model

Today `car_listings` has 40 columns, and **30 of them are already generic** —
source, media, freshness, dedupe, seller, geography. Only 10 are car-shaped. So
the migration is a split, not a rewrite.

```sql
-- geography: needed for rentals anyway, gives multi-city for free
cities     (id, slug, name, state, country, centroid, is_active)
localities (id, city_id, slug, name, aliases text[], centroid, is_active)

-- the core: everything the pipeline touches
listings (
  id, vertical, city_id, locality_id, location_text,
  price numeric, price_period text,          -- 'once' | 'month'
  listing_status, sale_status,
  source_platform, source_url, source_listing_id,
  seller_name, seller_phone, seller_type,
  source_id, org_id,
  media jsonb, hero_media_url, description,
  listed_at, first_seen_at, last_seen_at, delisted_at, updated_at,
  is_active, needs_review, review_reason,
  content_hash, dedup_cluster_id, is_cluster_head
)

-- typed attributes, one table per vertical, owned by that vertical
listing_car_attrs    (listing_id PK, make, model, variant, year,
                      km_driven, fuel_type, transmission, owner_count,
                      color, body_type)

listing_rental_attrs (listing_id PK, bhk, rent, deposit, maintenance,
                      furnishing, carpet_area_sqft, floor, total_floors,
                      available_from, property_type, tenant_preference,
                      parking, amenities text[])
```

**Typed side tables, not a jsonb blob.** Filters need real indexed columns — rent
ranges and BHK counts are the primary query path, and jsonb would hurt as soon as
there are thousands of rows. It also keeps a single source of truth: the vertical
owns its table, and the core pipeline only reaches attributes through
`persistAttrs` / `loadAttrs`.

### Renames worth doing in the same migration

`garages` → `organisations`, `dealer_sources` → `sources`. A rental broker is not
a garage, and the admin copy would read wrong on every screen. Phase 0 is already
rewriting this schema; doing the rename separately means two disruptive
migrations instead of one.

---

## 4. Repo layout after the refactor

```
apps/
  web           one shell, vertical-aware routes: /cars/*, /rent/*
  admin         vertical-aware; the listing editor renders from vertical.facets
  cron          unchanged — already fully generic
  scraper       orchestration only; verticals plug in
packages/
  pipeline      NEW. The domain-agnostic engine, lifted out of apps/scraper:
                  instagram/{discovery,media,frames,scoring}
                  lifecycle/{delist,dedupe,freshness}
                  storage/r2, ai/core
  verticals     NEW. cars/ and rentals/, each implementing Vertical<TAttrs>
  db            core schema + per-vertical attrs tables
  shared        money parsing, ranking maths, generic normalisation helpers
```

---

## 5. Ingestion without a scraping budget

Build the seam now, pay nothing yet.

```ts
export interface DiscoveryProvider {
  listPosts(handle: string, limit: number): Promise<PostRef[]>;
  fetchPost(url: string): Promise<RawPost>;
}
```

`instagram-media.ts` already isolates exactly this behind `extractPostMedia()`,
so the interface is a formalisation of what exists rather than new design.

**Ship `PlaywrightProvider`, hardened:**

- **Session pool** — several Instagram sessions stored encrypted in the DB,
  rotated per handle, with per-session cooldown and failure counts. This alone
  removes the single-point-of-failure that caused the fifteen-week outage.
- **Optional proxy** via env var, off by default.
- **Challenge detection** — recognise the checkpoint/login-wall page and mark
  that session cold instead of silently returning zero posts.
- **Backoff** on 429 and on empty-result runs.

`ApifyProvider` becomes one file implementing two methods, whenever you want it.
Nothing else changes.

**Cost today: zero.** Roughly a week of work.

---

## 6. Infrastructure: the Cloudflare move, assessed

Checked against the current Cloudflare docs rather than memory, because being
wrong here is expensive.

### 10.1 D1 — yes, with real work attached

| Constraint | Value | Verdict for us |
|---|---|---|
| Max database size | 10 GB (Workers Paid) | **Fine.** Media lives in R2; 50k listings ≈ 100 MB |
| Max columns per table | 100 | Fine — the core has ~30 |
| Bound parameters per query | **100** | **Bites.** A 30-column upsert is fine per row, but multi-row inserts hit this immediately |
| Queries per Worker invocation | 1,000 (paid) | **Bites.** The dedupe rebuild does one UPDATE per changed row |
| Writes | **Single-threaded per database** | Scraper upserts serialise |
| Max query duration | 30 s | Fine |

**Cost:** effectively free at our scale, against a monthly Postgres bill. Over a
year that is real money for a pre-revenue project. Read replication is a genuine
bonus for a public search site.

**What actually has to change:**

1. **The scraper writes from outside Cloudflare.** D1 is reached through a
   Workers binding or the REST API. The runner currently upserts row by row —
   500 rows becomes 500 round-trips. Fix: a Worker write-endpoint taking batches,
   using `db.batch()`. Two to three days.
2. **Dedupe must become incremental.** Rebuilding every cluster in the table
   will blow the 1,000-query cap. Only recompute clusters this run touched.
   Better design regardless.
3. **No array type.** `aliases` becomes a junction table (we query it);
   `amenities` becomes JSON (we don't).
4. **No native decimal.** Money moves to **integer paise** — genuinely better
   than the current numeric-as-string round-trip, and it removes a class of bug.
5. **The whole ranking query is dialect-specific.** `exp()`, interval arithmetic
   and the `jsonb` operators all need SQLite equivalents.

**Not a blocker, contrary to first instinct:** geography. I assumed the lack of
PostGIS would hurt, but city-scale rental search needs locality filtering (a
foreign key), map pins (two float columns) and radius search (bounding box plus
haversine over a few thousand rows). SQLite handles all three. I was wrong to
worry about it.

### 10.2 Where each piece runs

**The scraper cannot move.** Playwright and ffmpeg are native binaries; Workers
cannot run them. Cloudflare Containers could — up to 4 vCPU and 12 GiB — but it
bills per second for a workload the homelab already runs at zero marginal cost.
**Keep the scraper on Dokploy.** Move only the web app and admin to Workers.

### 10.3 The alternative worth knowing about

**Workers + Hyperdrive + Postgres** keeps Postgres entirely — no dialect port, no
batching rework — while still getting Workers hosting. Postgres would run on the
homelab (free) or a small VPS (a few dollars a month).

I am **not** recommending it, for one reason: putting the primary database on the
homelab makes home power and internet the availability floor for the public site.
D1 removes the homelab from the critical path for readers, which matters more
than the week it costs.

### 10.4 Sequencing — the one thing I would not do

Do not fold the engine change into the schema split as a single step.

Phase 0's entire value is: change one thing, prove cars renders identically.
Change the shape, the SQL dialect, the driver, the money representation and the
hosting at once, and a regression leaves you with five suspects.

**So: two commits, not one.**

- **0a** — split the schema on Postgres. Prove cars renders identically. *That
  tests the abstraction.*
- **0b** — port to D1 and OpenRouter. Prove cars renders identically again.
  *That tests the engine.*

Same total work as doing them together, two clean signals instead of none, and
if 0b hits a wall you stop with a working system and a proven abstraction rather
than a half-migrated mess. Phase 0 grows from one week to two.

### 10.5 OpenRouter — yes, and do it first

`resolveModel()` in `ai/core.ts` is already a provider switch; adding OpenRouter
is roughly thirty lines. It is the lowest-risk item on this list and it pays off
immediately, because rentals extraction will need model comparison that a single
hard-wired provider makes tedious.

Two things to verify when the key lands: that the chosen model accepts **image
inputs** (vision scoring depends on it) and that **structured output** works
through OpenRouter's routing for the model picked. Both are normal; both are
worth a ten-minute smoke test before building on them.

Keep `llm_usage_logs` writing exactly as it does — cost visibility matters more,
not less, once switching models is easy.

---

## 7. Cities and localities — a correction

`snapdata.dev` is a clean, free, no-auth republication of the
`dr5hn/countries-states-cities-database` — 152,970 cities worldwide with
coordinates, ODbL. **Good for the `cities` table.** It saves an afternoon.

**But it does not solve the problem rentals actually has.** That dataset is
country → state → *city*. For India it has Chennai; it does not have Adyar,
Velachery, Thiruvanmiyur or Perungudi. Localities — the thing every rental search
is actually filtered by — are not in it.

For localities:

1. **OpenStreetMap via Overpass** is the right source. Indian cities have
   `place=suburb` and `place=neighbourhood` nodes with coordinates. Free, ODbL.
2. **Mine our own captions.** The LLM already reads location text; cluster what
   it extracts and curate in the admin. This is how we catch broker slang —
   "near Adyar signal", "OMR Perungudi" — that no gazetteer contains.
3. **The admin queue takes the long tail**, exactly as unknown makes do today.

Both sources are ODbL share-alike, which carries attribution obligations. A
footer credit line is enough; worth doing from day one rather than retrofitting.

---

## 8. Alerts — first-class, not an afterthought

I under-weighted this. Search is one-shot; **alerts are the retention loop and
the monetisation hook**, and for rentals they are close to the whole product.
People hunt for a flat daily for a month. Nobody hunts for a car that way.

The freshness engine makes our alerts better than a portal's: we alert on
`first_seen_at`, which is when the listing genuinely appeared, not when a crawler
happened to notice it. That distinction is the difference between a useful alert
and a spam generator.

```sql
saved_searches (
  id, user_id, vertical, city_id,
  label,                      -- "2BHK Adyar under 30k"
  filters jsonb,              -- same shape the search page produces
  channels text[],            -- email | telegram | webpush
  min_interval_minutes,       -- rate limit per subscriber
  last_matched_at, last_notified_at,
  is_active, created_at
)

alert_deliveries (id, saved_search_id, listing_id, channel, sent_at, status)
```

**How it runs:** after each scrape completes, the cron service takes the listings
whose `first_seen_at` falls in this run, evaluates them against active saved
searches, and enqueues deliveries. It is vertical-agnostic — it operates on the
core `listings` table plus a filter blob — so cars gets alerts for free.

`alert_deliveries` exists to guarantee we never notify twice for the same
listing, which is the failure mode that gets an alert product muted.

**Channels, in the order I would build them:**

1. **Email** — universal, free via Cloudflare Email Routing or Resend.
2. **Telegram** — free, instant, no approval process, and widely used in India.
   The best value of the three.
3. **WhatsApp** — where people actually are, but the Business API carries cost
   and template approval. Worth it once there is demand to justify it, not before.

Web push is cheap to add later but has poor open rates on iOS.

---

## 9. The five hard problems rentals has and cars didn't

Naming these up front because they are where the schedule will actually go.

1. **Money is three numbers, not one.** Captions read "25k rent, 2L deposit, 3k
   maintenance". The extraction schema must separate them, and the caption
   cross-check — which already saved us from a 10× lakh/crore error on cars —
   needs a rentals variant that knows deposit is typically 2–10× rent. A deposit
   parsed as rent is the exact class of bug that put a ₹4.5 Cr car at the top of
   the feed.
2. **Localities are fuzzy.** "Near Adyar signal", "Thiruvanmiyur ECR", "OMR
   Perungudi". Needs an alias table, LLM-assisted mapping into it, and an admin
   correction path. This is the direct analogue of make/model canonicalisation
   and it is fiddlier.
3. **The same flat is posted by several brokers.** Cars dedupe was *within* one
   dealer. Cross-broker dedupe is genuinely harder: different photos, different
   quoted rent. Mitigation is **perceptual image hashing** to catch re-used
   photos, combined with (locality, BHK, rent ±5%) clustering. Worth building —
   it improves cars too.
4. **Listings die much faster.** Freshness half-life ~7 days rather than 30, and
   the delist sweep needs a shorter stale window. All configurable per vertical
   already.
5. **No structured fallback.** Cars had Cars24 and CarDekho JSON-LD as a quality
   baseline. Rentals is Instagram-only at first, so extraction accuracy carries
   the whole product. Expect to spend real time on the prompt and on the review
   queue.

---

## 10. Timeline

Grown from seven weeks to roughly nine, because the infrastructure move and a
proper alerts product were both added after the first draft.

| Phase | Weeks | Deliverable | Done when |
|---|---|---|---|
| **0a — Split the schema** | 1 | `packages/pipeline` + `packages/verticals`, core/attrs split, cars as vertical #1 — **still on Postgres** | **Cars renders identically.** Tests the abstraction |
| **0b — Move the engine** | 1 | D1 port, OpenRouter, batched writes, incremental dedupe, money as paise | **Cars renders identically again.** Tests the engine |
| **1 — Harden ingestion** | 1 | `DiscoveryProvider`, session pool, challenge detection, backoff | A killed session self-heals; a challenge page marks the session cold rather than silently returning nothing |
| **2 — Geography** | 0.5 | `cities` from snapdata, Chennai localities from OSM + alias table | Locality filtering works; unknown localities land in the admin queue |
| **3 — Rentals ingestion** | 2 | Rentals vertical: schema, prompt, normaliser, interior scoring, cluster key. 15–25 broker accounts | **300+ live listings**, ≥90% with correct rent, ≥80% with a locality |
| **4 — Rentals surface** | 2 | Search, filters, map, freshness ranking, WhatsApp handoff | Publicly shippable at `/rent` |
| **5 — Alerts** | 1 | Saved searches, match evaluator, email + Telegram delivery | A saved search fires once, and only once, per matching listing |
| **6 — MCP** | 0.5 | MCP server over the index | `find_listings` answers from Claude |

**Stopping rules.** If **0a** overruns by more than a week, the vertical
abstraction is wrong. If **0b** overruns, stop and stay on Postgres — the
abstraction still stands and you have lost nothing but the hosting bill. If
**3** overruns, the engine does not generalise. Each is information, not failure.

### Why cars migrates first

Building rentals on a new schema while cars stays on the old one would mean the
pipeline writes two shapes — the worst of both. Migrating cars makes "cars still
works" the proof that the engine generalises, before a single rental listing
exists.

## 11. First tasks

**Do OpenRouter first** — it is thirty lines, independent of everything else, and
it de-risks the rentals prompt work that comes later.

Then phase 0a, in order:

1. `packages/pipeline` — move the genuinely agnostic modules across
   (`instagram-media`, `video-frames`, `r2`, `images`, `progress`,
   `source-health`, `delist`, `ai/core`). Imports only, no logic changes.
2. Define `Vertical<TAttrs>` in `packages/verticals/src/types.ts`.
3. Implement `verticals/cars` by *moving* the existing prompt, normaliser,
   cluster key and ranking weights into it. Still no behaviour change.
4. Migration `0012`: create `cities`, `localities`, `listings`,
   `listing_car_attrs`; backfill from `car_listings`; rename `garages` and
   `dealer_sources`. Keep `car_listings` as a view for one release so nothing
   breaks mid-migration.
5. Point `apps/web` at the core plus `loadAttrs`. **Diff the rendered home page
   against today's.** If it matches, 0a is done.

Only then 0b, and only then rentals.

## 12. Open items

- Domain and brand name — not blocking, placeholder in code until decided.
- OpenRouter key (you mentioned sending it separately) — needed before phase 0b.
- Confirm the current PlanetScale bill, so the D1 saving is a real number rather
  than an assumption.
- Which 15–25 Chennai broker accounts to seed. Worth compiling that list during
  phase 0 so phase 3 starts with inputs ready.
- Map provider for phase 4 (MapLibre with free tiles is the zero-cost default).
- Whether to keep the Cars24 and CarDekho adapters. CarDekho only yields 20
  listings per run because it paginates client-side; both are low value next to
  Instagram, and dropping them would remove ~1,100 lines.

