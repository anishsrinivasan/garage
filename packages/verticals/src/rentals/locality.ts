/**
 * Resolves free-text location strings to a locality.
 *
 * Brokers do not write locality names the way a gazetteer does. Real captions
 * say "near Adyar signal", "OMR Perungudi", "Thoraipakkam behind IGP",
 * "Velacheri" and "Thiruvanmyur". This is the direct analogue of make/model
 * canonicalisation for cars, and it is fiddlier: there are 299 localities rather
 * than 30 makes, several appear inside each other's names, and the text arrives
 * with landmarks attached.
 *
 * Matching is deliberately ordered strongest-first, and a longer name beats a
 * shorter one contained within it — "Anna Nagar West" must not resolve to
 * "Anna Nagar", and "Besant Nagar" must never resolve to "Nagar".
 */

import { and, eq } from "drizzle-orm";
import { db, localities } from "@preowned-cars/db";

export type LocalityMatch = {
  localityId: string;
  name: string;
  /** How it matched, for the admin to judge whether to trust it. */
  via: "exact" | "alias" | "contained";
  confidence: number;
};

type LocalityRow = {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
};

/** Words that carry no locality signal and drown out the ones that do. */
const NOISE = new Set([
  "near", "opp", "opposite", "behind", "next", "to", "beside", "close", "by",
  "main", "road", "street", "st", "signal", "junction", "bus", "stop", "stand",
  "metro", "station", "chennai", "in", "at", "the", "a", "off", "back", "side",
  "area", "locality", "location", "landmark", "just", "walking", "distance",
  "mins", "minutes", "from", "and", "cross", "phase", "sector", "block",
]);

function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let cache: { rows: LocalityRow[]; cityId: string; at: number } | null = null;
const CACHE_MS = 5 * 60_000;

async function loadLocalities(cityId: string): Promise<LocalityRow[]> {
  if (cache && cache.cityId === cityId && Date.now() - cache.at < CACHE_MS) {
    return cache.rows;
  }
  const rows = await db
    .select({
      id: localities.id,
      name: localities.name,
      slug: localities.slug,
      aliases: localities.aliases,
    })
    .from(localities)
    .where(and(eq(localities.cityId, cityId), eq(localities.isActive, true)));

  // Longest name first, so a compound locality wins over the shorter one nested
  // inside it.
  rows.sort((a, b) => b.name.length - a.name.length);
  cache = { rows, cityId, at: Date.now() };
  return rows;
}

/** Drops the cached table. Call after editing localities in the admin. */
export function invalidateLocalityCache(): void {
  cache = null;
}

/**
 * Matches a caption's location text against the locality table.
 *
 * Returns null rather than a weak guess. A listing filed under the wrong
 * locality is worse than one filed under none — the admin's unmatched queue
 * exists precisely so that "no match" is a workable outcome.
 */
export async function resolveLocality(
  cityId: string,
  locationText: string | null | undefined,
  /** The full caption, searched when locationText alone yields nothing. */
  fallbackText?: string | null,
): Promise<LocalityMatch | null> {
  const rows = await loadLocalities(cityId);
  if (rows.length === 0) return null;

  for (const source of [locationText, fallbackText]) {
    if (!source) continue;
    const match = matchIn(normalise(source), rows);
    if (match) return match;
  }
  return null;
}

function matchIn(haystack: string, rows: LocalityRow[]): LocalityMatch | null {
  if (!haystack) return null;

  const words = haystack.split(" ").filter((w) => w && !NOISE.has(w));
  const meaningful = words.join(" ");

  // 1. The whole string is a locality name.
  for (const row of rows) {
    if (meaningful === normalise(row.name)) {
      return { localityId: row.id, name: row.name, via: "exact", confidence: 1 };
    }
  }

  // 2. The whole string is one of its aliases.
  for (const row of rows) {
    for (const alias of row.aliases) {
      if (meaningful === normalise(alias)) {
        return { localityId: row.id, name: row.name, via: "alias", confidence: 0.95 };
      }
    }
  }

  // 3. A name or alias appears inside the string. Rows are sorted longest-first,
  //    so "Anna Nagar West" is tested before "Anna Nagar".
  for (const row of rows) {
    const candidates = [row.name, ...row.aliases]
      .map(normalise)
      .filter((c) => c.length >= 4)
      .sort((a, b) => b.length - a.length);

    for (const candidate of candidates) {
      if (containsPhrase(haystack, candidate)) {
        return {
          localityId: row.id,
          name: row.name,
          via: "contained",
          // Longer matches inside a longer string are more convincing.
          confidence: Math.min(0.9, 0.55 + candidate.length / 40),
        };
      }
    }
  }

  return null;
}

/** Whole-word containment, so "Porur" never matches inside "Tiruporur". */
function containsPhrase(haystack: string, needle: string): boolean {
  const at = haystack.indexOf(needle);
  if (at === -1) return false;
  const before = at === 0 ? " " : haystack[at - 1]!;
  const afterIndex = at + needle.length;
  const after = afterIndex >= haystack.length ? " " : haystack[afterIndex]!;
  return before === " " && after === " ";
}
