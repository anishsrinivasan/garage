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

The last one shapes more than it looks. Because the budget is open, the plan
below **does not depend on a paid provider**. We build the interface, implement
the hardened self-hosted path, and leave a managed provider as a one-file drop-in
for whenever you want it.

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

## 6. The five hard problems rentals has and cars didn't

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

## 7. Seven-week plan

| Phase | Weeks | Deliverable | Done when |
|---|---|---|---|
| **0 — Extract the engine** | 1 | `packages/pipeline` + `packages/verticals`, schema split, cars as vertical #1 | **Cars renders identically to today.** That is the regression test for the abstraction |
| **1 — Harden ingestion** | 1 | `DiscoveryProvider`, session pool, challenge detection, backoff | A killed session self-heals; a challenge page marks the session cold instead of silently returning nothing |
| **2 — Geography** | 0.5 | `cities` + `localities`, Chennai localities seeded with aliases | Filtering by locality works; unknown localities land in the admin queue |
| **3 — Rentals ingestion** | 2 | Rentals vertical: schema, prompt, normaliser, interior scoring, cluster key. 15–25 broker accounts | **300+ live rental listings**, ≥90% with correct rent, ≥80% with a locality |
| **4 — Rentals surface** | 2 | Search, filters, map, freshness ranking, WhatsApp handoff | Publicly shippable at `/rent` |
| **5 — MCP + alerts** | 0.5 | MCP server over the index, saved searches | `find_listings` answers from Claude |

**Stopping rule:** if phase 0 or phase 3 overruns by more than a week, the
abstraction is wrong. Stop and reassess rather than pushing through — that
outcome is information, not failure.

### Sequencing note

Phase 0 migrates cars onto the generic core *deliberately*. Building rentals on a
new schema while cars stays on the old one would mean the pipeline writes to two
shapes, which is the worst of both. Migrating cars first makes "cars still works"
the proof that the engine generalises, before a single rental listing exists.

---

## 8. First tasks

In order, starting now:

1. `packages/pipeline` — move the genuinely agnostic modules across
   (`instagram-media`, `video-frames`, `r2`, `images`, `progress`,
   `source-health`, `delist`, `ai/core`). No logic changes; imports only.
2. Define `Vertical<TAttrs>` in `packages/verticals/src/types.ts`.
3. Implement `verticals/cars` by *moving* the existing prompt, normaliser,
   cluster key and ranking weights into it. Still no behaviour change.
4. Migration `0012`: create `cities`, `localities`, `listings`,
   `listing_car_attrs`; backfill from `car_listings`; rename `garages` and
   `dealer_sources`. Keep `car_listings` as a view for one release so nothing
   breaks mid-migration.
5. Point `apps/web` at the core + `loadAttrs`. **Diff the rendered home page
   against today's.** If it matches, phase 0 is done.

Only then start on rentals.

---

## 9. Open items

- Domain and brand name — not blocking, placeholder in code until decided.
- Which 15–25 Chennai broker accounts to seed. Worth compiling that list during
  phase 0 so phase 3 starts with inputs ready.
- Map provider for phase 4 (MapLibre with free tiles is the zero-cost default).
- Whether to keep the Cars24 and CarDekho adapters. CarDekho only yields 20
  listings per run because it paginates client-side; both are low value next to
  Instagram, and dropping them would remove ~1,100 lines.
