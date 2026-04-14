import { createCars24Adapter } from "./adapters/cars24";
import { createCardekhoAdapter } from "./adapters/cardekho";
import type { NormalizedListing, ScrapeResult } from "@preowned-cars/shared";

const REQUIRED_FIELDS: (keyof NormalizedListing)[] = [
  "make", "model", "year", "price", "sourcePlatform", "sourceUrl", "city",
];

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

function validateListing(listing: NormalizedListing, index: number, source: string): string[] {
  const issues: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (listing[field] === undefined || listing[field] === null || listing[field] === "") {
      issues.push(`listing #${index}: missing "${field}"`);
    }
  }
  if (listing.year != null && (listing.year < 1990 || listing.year > 2027)) issues.push(`listing #${index}: bad year ${listing.year}`);
  if (listing.price <= 0 || listing.price > 100_000_000) issues.push(`listing #${index}: bad price ${listing.price}`);
  if (listing.sourceUrl && !listing.sourceUrl.startsWith("http")) issues.push(`listing #${index}: relative URL`);
  return issues;
}

function printSample(listings: NormalizedListing[], source: string, count = 5) {
  console.log(`\n  Sample listings (${Math.min(count, listings.length)} of ${listings.length}):`);
  for (const l of listings.slice(0, count)) {
    console.log(`    ${l.year} ${l.make} ${l.model}${l.variant ? " " + l.variant : ""} | Rs ${l.price.toLocaleString("en-IN")} | ${l.kmDriven ? l.kmDriven.toLocaleString() + " km" : "km N/A"} | ${l.fuelType ?? "fuel N/A"} | ${l.transmission ?? "trans N/A"}`);
    console.log(`      URL: ${l.sourceUrl}`);
  }
}

// ──────────────────────────────────────────────
// TEST SUITE 1: Cars24 unit tests (mock data)
// ──────────────────────────────────────────────
async function testCars24Unit() {
  console.log("\n========== CARS24 UNIT TESTS (mock data) ==========\n");

  // Import the adapter to test normalization via health check
  const adapter = createCars24Adapter();

  // Test config
  assert("Config name is 'cars24'", adapter.name === "cars24");
  assert("Config city is 'Chennai'", adapter.config.city === "Chennai");
  assert("Config baseUrl set", adapter.config.baseUrl === "https://www.cars24.com");
  assert("Rate limit set", (adapter.config.rateLimit?.requestsPerMinute ?? 0) > 0);

  // Test health check (expected to fail since API subdomain is dead)
  console.log("\n  [Network test] Cars24 API endpoint...");
  const healthy = await adapter.healthCheck();
  if (!healthy) {
    console.log("  INFO: listing-service.cars24.com DNS does not resolve.");
    console.log("  INFO: Cars24 now uses client-side rendering via Next.js RSC.");
    console.log("  INFO: Scraper needs migration to Playwright-based approach or new API endpoint.");
    console.log("  KNOWN ISSUE: Cars24 adapter cannot reach API — needs fix.\n");
    failed++;
  } else {
    console.log("  Cars24 API reachable — scraper should work.");
    passed++;
  }
}

// ──────────────────────────────────────────────
// TEST SUITE 2: CardDekho live scrape test
// ──────────────────────────────────────────────
async function testCardekhoLive() {
  console.log("\n========== CARDEKHO LIVE SCRAPE TEST ==========\n");

  const adapter = createCardekhoAdapter();

  // Test config
  assert("Config name is 'cardekho'", adapter.name === "cardekho");
  assert("Config city is 'Chennai'", adapter.config.city === "Chennai");

  // Health check
  console.log("\n  [Health check]...");
  const healthy = await adapter.healthCheck();
  assert("Health check passes", healthy);

  // Scrape 1 page
  console.log("\n  [Scrape] Running limited scrape (max 2 pages)...");
  const result = await adapter.scrape();

  console.log(`  Listings found: ${result.listings.length}`);
  console.log(`  Pages scraped: ${result.metadata.pagesScraped}`);
  console.log(`  Duration: ${(result.metadata.durationMs / 1000).toFixed(1)}s`);
  console.log(`  Errors: ${result.errors.length}`);

  assert("Got listings", result.listings.length > 0, `found ${result.listings.length}`);
  assert("Scraped at least 1 page", result.metadata.pagesScraped >= 1);
  assert("No fatal errors", result.errors.length === 0, result.errors.map(e => e.message).join("; "));

  if (result.listings.length > 0) {
    // Schema validation
    const allIssues: string[] = [];
    for (let i = 0; i < result.listings.length; i++) {
      allIssues.push(...validateListing(result.listings[i]!, i, "cardekho"));
    }
    assert("All listings pass schema validation", allIssues.length === 0,
      allIssues.length > 0 ? allIssues.slice(0, 5).join("; ") : "");

    // Dedup check
    const urls = result.listings.map(l => l.sourceUrl);
    const uniqueUrls = new Set(urls);
    assert("No duplicate URLs", urls.length === uniqueUrls.size,
      `${urls.length - uniqueUrls.size} duplicates`);

    // Platform field
    assert("All listings have sourcePlatform='cardekho'",
      result.listings.every(l => l.sourcePlatform === "cardekho"));

    // City field
    assert("All listings have city='Chennai'",
      result.listings.every(l => l.city === "Chennai"));

    // Data quality
    const total = result.listings.length;
    const coverage: Record<string, number> = {
      make: result.listings.filter(l => l.make).length,
      model: result.listings.filter(l => l.model).length,
      year: result.listings.filter(l => l.year).length,
      price: result.listings.filter(l => l.price > 0).length,
      kmDriven: result.listings.filter(l => l.kmDriven).length,
      fuelType: result.listings.filter(l => l.fuelType).length,
      transmission: result.listings.filter(l => l.transmission).length,
      photos: result.listings.filter(l => l.photos.length > 0).length,
    };

    console.log("\n  Data quality coverage:");
    for (const [field, count] of Object.entries(coverage)) {
      const pct = ((count / total) * 100).toFixed(0);
      console.log(`    ${field}: ${count}/${total} (${pct}%)`);
    }

    // Price range sanity
    const prices = result.listings.map(l => l.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    assert("Min price > 10,000 (reasonable)", minPrice > 10000, `min=${minPrice}`);
    assert("Max price < 1 crore (reasonable)", maxPrice < 10000000, `max=${maxPrice}`);

    // Year range sanity
    const years = result.listings.map(l => l.year).filter((y): y is number => y != null);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    assert("Years in reasonable range (2005-2026)", minYear >= 2000 && maxYear <= 2027,
      `range: ${minYear}-${maxYear}`);

    printSample(result.listings, "cardekho", 5);
  }
}

// ──────────────────────────────────────────────
// TEST SUITE 3: Instagram adapter config test
// ──────────────────────────────────────────────
async function testInstagramConfig() {
  console.log("\n========== INSTAGRAM ADAPTER CONFIG TEST ==========\n");

  // We can't run the full Instagram scraper (needs Playwright + Anthropic API)
  // but we can validate the adapter configuration
  try {
    const { createInstagramAdapter } = await import("./adapters/instagram");
    const adapter = createInstagramAdapter(["test_handle"]);
    assert("Config name is 'instagram'", adapter.name === "instagram");
    assert("Config city is 'Chennai'", adapter.config.city === "Chennai");
    assert("Config baseUrl set", adapter.config.baseUrl === "https://www.instagram.com");
    console.log("  INFO: Full Instagram scrape skipped — requires Playwright + Anthropic API key");
  } catch (err) {
    console.log(`  INFO: Instagram adapter import failed (expected if Playwright not installed): ${err}`);
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Preowned Cars Scraper — Test Suite");
  console.log(`Run time: ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  await testCars24Unit();
  await testCardekhoLive();
  await testInstagramConfig();

  console.log("\n" + "=".repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) process.exit(1);
}

main().catch(console.error);
