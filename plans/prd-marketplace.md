# PRD — Instagram as India's classifieds layer

**Status:** proposal for a direction decision. Nothing here is built.
**Date:** 2026-09-08
**Author:** drafted from a read of the Torque codebase + its production data

---

## 1. The bet

Torque proved something more general than "we can list used cars."

It proved that **a large amount of real, transactable Indian inventory lives on
Instagram, and it is completely unsearchable.** 646 posts processed, 415 of them
genuine listings — a 64% signal rate from fifteen accounts that no portal
indexes. Those cars are not on Cars24 or CarDekho. You cannot find them with
Google. The only way to see them today is to already follow the dealer.

The same is true — more so — of rentals, resale property, commercial space,
equipment, and furniture. Instagram and WhatsApp are where Indian small
businesses actually transact, and there is no index over any of it.

**The bet: build the index. Cars was the proof. The product is the engine.**

---

## 2. What the codebase already tells us

The build-versus-fork question has a measurable answer. Counting lines that
contain *any* car-domain vocabulary:

| Component | Lines | Car-specific? |
|---|---|---|
| `instagram-media.ts` — scoped extraction from IG's GraphQL payload | 324 | **None.** This is the hardest code in the repo |
| `apps/cron` — scheduler, job queue, health API | 447 | **None** |
| `video-frames.ts` — reel frame extraction | 142 | None |
| `utils/{r2,images,progress}.ts`, `source-health.ts` | ~260 | None |
| `delist.ts` — freshness lifecycle, coverage guards | 209 | 2 refs, both comments |
| `ranking.ts` — recency decay, freshness bands | 139 | 1 constant (`PREMIUM_MAKES`) |
| `price.ts` — Indian lakh/crore parsing | 207 | 1 table (segment ceilings) |
| `ai/core.ts` — `generateStructured` takes *any* Zod schema | 141 | Generic by construction |
| — | — | — |
| `normalize.ts` — make/fuel/body vocabularies | 323 | **Yes** |
| `instagram-llm.ts` — extraction prompt + schema | 196 | **Yes** |
| `instagram-image-scoring.ts` — thumbnail scoring prompt | 158 | **Yes** (one prompt string) |
| `dedupe.ts` — cluster key | 173 | **Yes** (the key only) |
| cars24 / cardekho / olx adapters | ~1,100 | **Yes**, and OLX is already disabled |

**Roughly 1,400 lines of the harvesting engine carry no domain vocabulary at
all, and another ~700 are one config swap away.** The genuinely car-shaped
surface is about 850 lines: an extraction prompt, a normalisation vocabulary, a
dedupe key, and the card UI.

A second vertical is a schema-and-prompt exercise, not a rewrite. That is the
single most important fact in this document, and it is why the recommendation
below is not "start a new app."

### What Torque also proved works

- **Vision-scored thumbnails.** Front-three-quarter shots scored 90–95; a
  collage reel cover scored 30. This is the difference between a listing that
  looks like a listing and one that looks like a screenshot.
- **A freshness engine that refuses to lie.** Delisting is coverage-guarded and
  will not retire a source whose scraper is broken.
- **Cost is not the constraint.** 646 posts cost 729k input / 471k output tokens
  on Flash-class inference — fractions of a cent per post. We can afford to be
  generous with extraction.

---

## 3. The three ideas, assessed

You raised three. They are not alternatives; two are features of the third.

### (A) Multi-vertical marketplace — **this is the product**

### (B) Better scraping — **this is infrastructure**, and the current setup has a
named, already-realised failure: one session file, one box, no proxy rotation.
It caused a fifteen-week outage. See §6.

### (C) MCP portal — **this is a distribution channel** over an index you have to
build first. An agent that crawls Instagram live, per query, is slow (minutes),
expensive, and the fastest possible way to get the account banned. An MCP server
over an index you already hold is a week of work and genuinely differentiated,
because the index contains listings Google does not have. See §7.

---

## 4. Recommendation: one engine, second vertical, same repo

**Launch Chennai rentals on the Torque pipeline within 6 weeks. Keep Torque as
the cars brand. One codebase, two verticals, shared engine.**

Why rentals specifically:

1. **Frequency.** People search rentals every week for a month. They buy a car
   once every three years. Search frequency is what builds a habit and a brand.
2. **Freshness is worth 10× more.** A rental listing is dead in two weeks. The
   entire freshness subsystem — first/last seen, coverage-guarded delisting,
   age chips, stale banners — was built for a problem cars have mildly and
   rentals have acutely. It is the differentiator, and it is currently
   under-deployed.
3. **The inventory genuinely isn't indexed.** Chennai brokers post flats as reels
   daily. 99acres and NoBroker do not have them.
4. **Same city, same technique.** Likely overlapping account networks. The
   Instagram extraction, media scoring, R2 pipeline and scheduler carry over
   unchanged.
5. **It is the cheapest possible test of the abstraction.** If a second vertical
   takes more than three weeks, the engine does not generalise and we have
   learned that for three weeks of work instead of six months.

Why not the alternatives:

- **A separate app** would fork the hardest code in the repo (IG extraction) and
  leave you maintaining two copies of it.
- **Cars only** means competing with four funded incumbents on a low-frequency
  search, while the asset you just built sits idle.
- **All verticals at once** ships nothing.

---

## 5. Product definition

### Users

| User | Job | Today |
|---|---|---|
| **Seeker** (renter / buyer) | "Find me the flats and cars that exist right now, that I can't find on the portals" | Follows 20 broker accounts, scrolls, DMs, most are already gone |
| **Supplier** (broker / dealer) | "Get my listings in front of people without paying a portal" | Posts to IG, reaches only existing followers |
| **Operator** (you) | "Keep the index fresh and honest without babysitting it" | Admin dashboard + cron (already built) |

### The one thing this does better than anything else

**Every listing carries an honest date and a confirmed-recently signal.** No
Indian portal does this. 99acres will happily show you a flat let six months ago.
That is the promise, and the engineering is already done.

### Scope

**V1 (rentals, Chennai)**
- Ingest N broker accounts; extract structure: BHK, rent, deposit, furnishing,
  area/locality, floor, carpet area, amenities, availability date
- Locality normalisation (the equivalent of make/model canonicalisation) —
  Adyar / adyar / ADYAR / Adayar collapse to one filter
- Freshness-first ranking, reusing `ranking.ts` with a rentals weight set
- Vision scoring re-pointed at interiors: reject blurry, prefer wide well-lit
  rooms, penalise floor-plan-only and text-card covers
- Dedupe on (locality, BHK, rent band, broker) — same shape, different key
- WhatsApp deep-link to the broker (already built for cars)
- Map view — the one genuinely new UI surface rentals need

**Explicitly not in V1:** in-app messaging, payments, verification/inspection,
tenant screening, listing-owner accounts.

**V2**
- Second city, or resale property in Chennai — whichever the V1 data says
- "Claim your listing" flow for brokers (see §8)
- Saved searches + alerts (the freshness engine makes these actually good)

---

## 6. Ingestion: four options

The current pipeline is self-hosted Playwright with a single logged-in session
file, no proxy rotation, running on one box. **This has already failed once for
fifteen weeks.** Options, honestly:

| | Approach | Cost shape | Reliability | Control | Effort |
|---|---|---|---|---|---|
| **1** | Harden what exists: session pool, residential proxies, fingerprint rotation | Proxy $ / GB | Medium-high | Total | 1–2 weeks |
| **2** | Apify actors for Instagram discovery | Per result | High | Low | Days |
| **3** | Managed unblocker (Bright Data / Zyte / Oxylabs) | Per request, pricier | Highest | Medium | ~1 week |
| **4** | **Hybrid: managed discovery + own enrichment** | Per result, low volume | High | High where it matters | ~1 week |

**Dead end worth naming:** the official Instagram Graph API only exposes accounts
*you own or manage*. It cannot discover or read third-party accounts. It does not
solve this problem and is not worth investigating.

### Recommended: option 4

Split the pipeline at the seam that already exists in the code:

- **Discovery** — "which posts exist on this account, and what is their raw
  payload." This is commodity work, it is where the blocking arms race happens,
  and it is where account bans come from. **Rent it.**
- **Enrichment** — LLM extraction, vision scoring, reel frame extraction,
  normalisation, dedupe, freshness. This is the moat. **Own it.**

`instagram-media.ts` already isolates discovery behind `extractPostMedia()`.
Swapping in a managed provider means implementing one function, and the existing
Playwright path stays as a fallback. That is a genuinely small change for a large
reliability gain.

Do option 1's session pool regardless — it is cheap insurance and useful even
behind a managed provider.

---

## 7. MCP: distribution, not crawling

Build an MCP server over the index. `queries.ts` already has the shape of it.

```
find_listings(vertical, city, locality?, price_range?, bhk?, freshness?)
get_listing(id)
watch_search(query)        → alerts when new matches land
```

- **Consumer surface:** "find me 2BHK rentals in Adyar under ₹35k posted this
  week" from Claude or ChatGPT, answered from an index that has inventory Google
  does not.
- **B2B surface:** licence the same feed to relocation services, PG operators,
  interior firms — anyone whose customers are moving house.

**One week of work, high leverage, near-zero risk.** But it is worth being clear
that it is a *channel*. It does not create inventory, and shipping it before
there is an index worth querying would be premature.

---

## 8. Monetisation, most to least credible

1. **Lead fees from suppliers.** The WhatsApp deep-link is already built; instrument
   it and charge per qualified lead. Brokers and dealers already pay portals for
   exactly this.
2. **"Claim your account."** Invert the relationship: instead of scraping a broker,
   offer them a free syndicated, searchable, SEO'd microsite fed by their own
   Instagram, with lead capture. The garage onboarding flow in the admin is
   already 80% of this. **This also converts the biggest legal risk into the
   business model** — see §9.
3. **Feed / API / MCP licensing.** Low volume, high margin, no support burden.
4. **Consumer subscriptions.** Weakest. Indian consumer willingness-to-pay for
   search is close to zero. Do not plan around it.

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Instagram account bans / blocking** | High, already realised | Session pool, residential proxies, managed discovery (§6), per-source health monitoring (built) |
| **ToS and re-publishing photos** | Medium, real | The durable fix is consent. Route 2 in §8 turns suppliers into partners who *want* the distribution, which changes the posture from scraping to syndication. Worth a lawyer's hour before scaling. |
| **Rentals is a crowded, funded market** | High | Do not compete on features. Compete on inventory nobody else has, and on honest dates, which nobody else offers |
| **Extraction quality on a new vertical** | Medium | The review queue and confidence flagging already exist; point them at rent/BHK the way they point at price today |
| **Single-operator ops load** | Medium | The cron service and admin already remove most of it. Managed discovery removes more |
| **The engine doesn't generalise** | Medium | This is exactly what the 6-week rentals test is for, and why it is 6 weeks and not 6 months |

---

## 10. Roadmap

| Phase | Weeks | Outcome |
|---|---|---|
| **0 — Extract the engine** | 1 | Move domain-agnostic code into `packages/pipeline`. Introduce a `vertical` concept: schema, prompt, normaliser, dedupe key, ranking weights. Cars becomes vertical #1 with no behaviour change. |
| **1 — Ingestion hardening** | 1 | Session pool + swap discovery behind a provider interface. Playwright stays as fallback. |
| **2 — Rentals ingestion** | 2 | 15–25 Chennai broker accounts. Rent/BHK/locality extraction, locality canonicalisation, interior-tuned vision scoring. Target: 300+ live listings. |
| **3 — Rentals surface** | 2 | Search, map, freshness-first ranking, WhatsApp handoff. Ship publicly. |
| **4 — MCP + alerts** | 1 | MCP server, saved searches, alerts. |
| **5 — Decide** | — | Data says: second city, third vertical, or double down. |

**Six weeks to a second live vertical.** If phase 2 overruns badly, the
abstraction is wrong — stop and reassess rather than pushing through.

---

## 11. Open questions for you

1. **Rentals or resale property?** I recommend rentals for frequency and
   freshness. Resale has higher AOV and easier lead monetisation. Your call —
   it is the one genuinely uncertain choice here.
2. **One brand or two?** A shared brand with vertical sections is cheaper; two
   brands are sharper positioning. I lean shared until there is traction.
3. **How much appetite for the supplier-side product?** Route 2 in §8 is
   strategically the strongest move and the largest change of posture.
4. **Chennai only, or Chennai + Bangalore?** One city until the engine is proven.
5. **Budget for managed scraping?** Changes the §6 recommendation materially.
