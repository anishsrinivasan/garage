/**
 * Seeds cities and localities.
 *
 *   bun run apps/scraper/src/seed-geography.ts [city-slug]
 *
 * Cities come from snapdata.dev's republication of the countries-states-cities
 * dataset. Localities come from OpenStreetMap via Overpass, because that dataset
 * stops at city level — it has Chennai but not Adyar, and localities are what
 * every rental search is actually filtered by.
 *
 * Neither source contains how brokers write these names. "Thiruvanmiyur" appears
 * in OSM; "Tiruvanmiyur", "Thiruvanmyur" and "near Adyar signal" do not. So each
 * locality gets a generated alias set, plus a small curated supplement for the
 * ones we already know OSM spells differently.
 *
 * Both sources are ODbL share-alike. Attribution belongs in the site footer.
 */

import { and, eq } from "drizzle-orm";
import { db, cities, localities } from "@preowned-cars/db";

const OVERPASS = "https://overpass-api.de/api/interpreter";

type OsmNode = {
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
};

/**
 * Names OSM spells differently from the way listings do, or omits. Each entry is
 * canonical-name -> extra aliases. Kept deliberately small: the generated rules
 * below cover most variation, and a long hand-maintained list rots.
 */
const CURATED_ALIASES: Record<string, string[]> = {
  Velachery: ["velacheri", "velachery", "vellachery"],
  Thiruvanmiyur: ["tiruvanmiyur", "thiruvanmyur", "tiruvanmyur"],
  "Anna Nagar": ["annanagar", "anna ngr"],
  Adyar: ["adayar", "adyaar"],
  Alwarpet: ["alwarpettai"],
  Mylapore: ["mylapur", "myalpore"],
  Kodambakkam: ["kodambakam"],
  Nungambakkam: ["nungambakam"],
  Perungudi: ["perungudi", "perungudy"],
  Sholinganallur: ["cholinganallur", "solinganallur"],
  Pallikaranai: ["pallikarani"],
  Porur: ["poroor"],
  Guindy: ["gindy"],
};

/**
 * Localities listings mention constantly that are corridors or landmarks rather
 * than OSM places. Without these, a large share of Chennai rental captions have
 * no locality at all.
 */
const EXTRA_LOCALITIES: Array<{ name: string; lat: number; lon: number; aliases: string[] }> = [
  // Corridors and landmarks, which are not OSM "places" but appear in captions
  // constantly.
  { name: "OMR", lat: 12.9165, lon: 80.2276, aliases: ["old mahabalipuram road", "rajiv gandhi salai", "it corridor"] },
  { name: "ECR", lat: 12.9010, lon: 80.2470, aliases: ["east coast road"] },
  { name: "GST Road", lat: 12.9500, lon: 80.1400, aliases: ["gst", "grand southern trunk road"] },
  { name: "T. Nagar", lat: 13.0418, lon: 80.2341, aliases: ["t nagar", "tnagar", "thyagaraya nagar", "theagaraya nagar"] },

  // Major rental areas that Overpass misses for Chennai. Some sit outside the
  // strict city administrative boundary the query uses (Tambaram, Chromepet and
  // Pallavaram are separate municipalities); others simply have no place node.
  // Leaving them out would put a hole through the middle of rental coverage.
  { name: "Velachery", lat: 12.9750, lon: 80.2210, aliases: ["velacheri", "vellachery", "velachary"] },
  { name: "Porur", lat: 13.0359, lon: 80.1560, aliases: ["poroor"] },
  { name: "Tambaram", lat: 12.9249, lon: 80.1000, aliases: ["west tambaram", "east tambaram"] },
  { name: "Chromepet", lat: 12.9516, lon: 80.1462, aliases: ["chrompet", "chromepettai"] },
  { name: "Pallavaram", lat: 12.9675, lon: 80.1491, aliases: ["pallavarm"] },
  { name: "Keelkattalai", lat: 12.9481, lon: 80.1899, aliases: ["kilkattalai"] },
  { name: "Selaiyur", lat: 12.9070, lon: 80.1390, aliases: ["selaiyoor"] },
  { name: "Valasaravakkam", lat: 13.0410, lon: 80.1750, aliases: ["valasarawakkam"] },
  { name: "Ramapuram", lat: 13.0320, lon: 80.1790, aliases: [] },
  { name: "Mogappair", lat: 13.0850, lon: 80.1750, aliases: ["mogapair", "mogappair west", "mogappair east"] },
  { name: "Ambattur", lat: 13.1143, lon: 80.1548, aliases: [] },
  { name: "Avadi", lat: 13.1147, lon: 80.1098, aliases: [] },
  { name: "Poonamallee", lat: 13.0480, lon: 80.0950, aliases: ["punamallee"] },
  { name: "Kelambakkam", lat: 12.7920, lon: 80.2200, aliases: [] },
  { name: "Navalur", lat: 12.8440, lon: 80.2270, aliases: ["navallur"] },
  { name: "Siruseri", lat: 12.8230, lon: 80.2200, aliases: ["siruseri sipcot", "sipcot"] },
  { name: "Padur", lat: 12.8090, lon: 80.2230, aliases: [] },
  { name: "Thalambur", lat: 12.8360, lon: 80.2110, aliases: ["thalampur"] },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generates the spelling variants Indian transliteration actually produces.
 * These are rules, not a word list, so they keep working for localities nobody
 * has thought about yet.
 */
function generateAliases(name: string): string[] {
  const base = name.toLowerCase().trim();
  const out = new Set<string>([base]);

  out.add(base.replace(/[^a-z0-9]/g, "")); // "anna nagar" -> "annanagar"
  out.add(base.replace(/\./g, ""));        // "t. nagar"   -> "t nagar"

  // Tamil transliteration alternates between aspirated and unaspirated forms.
  out.add(base.replace(/\bth/g, "t"));     // thiruvanmiyur -> tiruvanmiyur
  out.add(base.replace(/\bt(?!h)/g, "th"));
  out.add(base.replace(/oo/g, "u"));
  out.add(base.replace(/ee/g, "i"));
  out.add(base.replace(/puram\b/g, "pram"));

  // "Nagar" and "Colony" are frequently dropped in captions.
  const trimmed = base.replace(/\s+(nagar|colony|garden|gardens)$/g, "").trim();
  if (trimmed && trimmed !== base && trimmed.length > 3) out.add(trimmed);

  out.delete("");
  return [...out];
}

async function fetchOsmLocalities(cityName: string): Promise<OsmNode[]> {
  const query = `
    [out:json][timeout:60];
    area["name"="${cityName}"]["boundary"="administrative"]->.city;
    ( node(area.city)["place"~"^(suburb|neighbourhood|quarter)$"]; );
    out body;`;

  // Overpass returns 406 without an explicit form content-type, and asks for a
  // identifying User-Agent in its usage policy.
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      "user-agent": "torque-classifieds/0.1 (locality seeding; contact via repo)",
    },
    body: new URLSearchParams({ data: query }).toString(),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    throw new Error(
      `Overpass returned ${res.status}. It rate-limits aggressively — wait a minute and retry.`,
    );
  }
  const body = (await res.json()) as { elements?: OsmNode[] };
  return (body.elements ?? []).filter((e) => e.tags?.name && e.lat && e.lon);
}

async function main() {
  const citySlug = process.argv[2] ?? "chennai";

  const [city] = await db
    .select({ id: cities.id, name: cities.name })
    .from(cities)
    .where(eq(cities.slug, citySlug))
    .limit(1);

  if (!city) {
    console.error(
      `No city with slug "${citySlug}". Migration 0012 seeds Chennai; add others there first.`,
    );
    process.exit(1);
  }

  console.log(`Seeding localities for ${city.name}…`);
  const nodes = await fetchOsmLocalities(city.name);
  console.log(`  OpenStreetMap: ${nodes.length} named locality nodes`);

  const seen = new Set<string>();
  const rows: Array<{
    cityId: string;
    slug: string;
    name: string;
    aliases: string[];
    latitude: number;
    longitude: number;
  }> = [];

  for (const node of nodes) {
    const name = node.tags!.name!.trim();
    const slug = slugify(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    rows.push({
      cityId: city.id,
      slug,
      name,
      aliases: [...new Set([...generateAliases(name), ...(CURATED_ALIASES[name] ?? [])])],
      latitude: node.lat!,
      longitude: node.lon!,
    });
  }

  for (const extra of EXTRA_LOCALITIES) {
    const slug = slugify(extra.name);
    if (seen.has(slug)) continue;
    seen.add(slug);
    rows.push({
      cityId: city.id,
      slug,
      name: extra.name,
      aliases: [...new Set([...generateAliases(extra.name), ...extra.aliases])],
      latitude: extra.lat,
      longitude: extra.lon,
    });
  }

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const [existing] = await db
      .select({ id: localities.id })
      .from(localities)
      .where(and(eq(localities.cityId, row.cityId), eq(localities.slug, row.slug)))
      .limit(1);

    if (existing) {
      await db
        .update(localities)
        .set({ name: row.name, aliases: row.aliases, latitude: row.latitude, longitude: row.longitude })
        .where(eq(localities.id, existing.id));
      updated++;
    } else {
      await db.insert(localities).values(row);
      inserted++;
    }
  }

  const totalAliases = rows.reduce((n, r) => n + r.aliases.length, 0);
  console.log(
    `  ${inserted} inserted, ${updated} updated, ${totalAliases} aliases (${(totalAliases / rows.length).toFixed(1)} per locality)`,
  );
  console.log("\nData © OpenStreetMap contributors, ODbL. Attribution belongs in the site footer.");
  process.exit(0);
}

void main();
