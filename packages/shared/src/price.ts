/**
 * Indian price parsing and sanity checking.
 *
 * The LLM extraction step gets lakh/crore wrong often enough to matter: a
 * caption reading `₹ 45 Lakhs` came back as 45,000,000 (₹4.50 Cr) and, because
 * the default feed sorted by price, that single 10x error pinned a stale listing
 * to the top of the home page. So we never trust the model's number on its own —
 * `reconcilePrice` re-reads the caption deterministically and prefers the regex
 * result whenever the two disagree by a clean power of ten.
 */

export const LAKH = 100_000;
export const CRORE = 10_000_000;

/** Absolute bounds. Anything outside is a parse error, not a real car. */
export const MIN_PRICE = 25_000;
export const MAX_PRICE = 200_000_000;

const NUM = String.raw`(\d{1,3}(?:,\d{2,3})*(?:\.\d+)?|\d+(?:\.\d+)?)`;

// Ordered most-specific first: `cr` must beat `c`, `lakh` must beat `l`.
const UNIT_PATTERNS: Array<{ re: RegExp; multiplier: number }> = [
  { re: new RegExp(`${NUM}\\s*(?:crores?|crs?\\b|cr\\b)`, "gi"), multiplier: CRORE },
  { re: new RegExp(`${NUM}\\s*(?:lakhs?|lacs?|lakh|lac)\\b`, "gi"), multiplier: LAKH },
  // Bare `L` suffix, as in `₹45L` / `45 L`. Requires a currency marker or a
  // word boundary so we don't read "45 Litres" as a price.
  { re: new RegExp(`${NUM}\\s*l\\b(?!\\s*(?:itre|iter))`, "gi"), multiplier: LAKH },
  { re: new RegExp(`${NUM}\\s*k\\b`, "gi"), multiplier: 1_000 },
];

function toNumber(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses a single price-ish token, e.g. `"₹ 45 Lakhs"`, `"1.2 Cr"`, `"12,50,000"`.
 * Returns rupees, or null when nothing plausible is found.
 */
export function parseIndianPrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[₹]/g, " ").replace(/\brs\.?\b/gi, " ");

  for (const { re, multiplier } of UNIT_PATTERNS) {
    re.lastIndex = 0;
    const match = re.exec(cleaned);
    if (match?.[1]) {
      const value = toNumber(match[1]);
      if (value != null) return Math.round(value * multiplier);
    }
  }

  const bare = cleaned.match(new RegExp(NUM));
  if (bare?.[1]) {
    const value = toNumber(bare[1]);
    if (value != null && value >= MIN_PRICE) return Math.round(value);
  }
  return null;
}

/**
 * Scans a whole Instagram caption for price mentions and returns every
 * plausible candidate, best first. Captions are noisy (`2021`, `44,575 kms`,
 * `3 Owner`, phone numbers), so we only accept numbers that either carry a unit
 * suffix or sit next to a currency marker.
 */
export function extractPriceCandidates(caption: string | null | undefined): number[] {
  if (!caption) return [];
  const text = caption.replace(/₹/g, " ₹ ").replace(/\brs\.?\b/gi, " ₹ ");
  const candidates: number[] = [];

  for (const { re, multiplier } of UNIT_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const value = toNumber(match[1]!);
      if (value == null) continue;
      // `2021 L` would be a year followed by a stray letter — a 4-digit number
      // with a lakh suffix above 500 is not a price anyone writes.
      if (multiplier === LAKH && value > 500) continue;
      if (multiplier === CRORE && value > 50) continue;
      const rupees = Math.round(value * multiplier);
      if (rupees >= MIN_PRICE && rupees <= MAX_PRICE) candidates.push(rupees);
    }
  }

  // Explicit rupee amounts written in full: `₹ 12,50,000`.
  const currencyRe = new RegExp(`₹\\s*${NUM}(?!\\s*(?:l|k|cr|lakh|lac|crore))`, "gi");
  let match: RegExpExecArray | null;
  while ((match = currencyRe.exec(text)) !== null) {
    const value = toNumber(match[1]!);
    if (value != null && value >= MIN_PRICE && value <= MAX_PRICE) {
      candidates.push(Math.round(value));
    }
  }

  return Array.from(new Set(candidates));
}

export type PriceReconciliation = {
  price: number | null;
  /** True when we overrode the model's answer. */
  corrected: boolean;
  reason: string | null;
};

/**
 * Cross-checks an LLM-extracted price against the source text.
 *
 * The failure mode we actually see is a clean power-of-ten slip (`45 Lakhs`
 * read as 4.5 Cr), so when the caption yields a candidate that differs from the
 * model's number by exactly 10x or 100x we take the caption's. Anything else we
 * leave alone — the model reads image overlays that the caption doesn't repeat,
 * and we don't want to throw those away.
 */
export function reconcilePrice(
  llmPrice: number | null | undefined,
  caption: string | null | undefined,
): PriceReconciliation {
  const candidates = extractPriceCandidates(caption);

  if (llmPrice == null) {
    // Only fall back to the caption when it names exactly one price; two or
    // more usually means EMI figures or a price range we shouldn't guess at.
    if (candidates.length === 1) {
      return { price: candidates[0]!, corrected: true, reason: "llm_missing_caption_single" };
    }
    return { price: null, corrected: false, reason: null };
  }

  for (const candidate of candidates) {
    if (candidate === llmPrice) return { price: llmPrice, corrected: false, reason: null };
  }

  for (const factor of [10, 100]) {
    for (const candidate of candidates) {
      if (Math.abs(llmPrice - candidate * factor) < 1) {
        return {
          price: candidate,
          corrected: true,
          reason: `llm_overstated_${factor}x`,
        };
      }
      if (Math.abs(llmPrice * factor - candidate) < 1) {
        return {
          price: candidate,
          corrected: true,
          reason: `llm_understated_${factor}x`,
        };
      }
    }
  }

  return { price: llmPrice, corrected: false, reason: null };
}

/**
 * Rough per-segment ceilings, used to flag rather than reject. A listing that
 * trips this lands in the admin review queue with `needs_review = true`; we
 * never silently drop it, because a genuine Rolls-Royce should still show up.
 */
const SEGMENT_CEILINGS: Array<{ makes: string[]; ceiling: number }> = [
  {
    makes: ["rolls-royce", "bentley", "ferrari", "lamborghini", "mclaren", "aston martin", "maserati"],
    ceiling: 120 * CRORE,
  },
  { makes: ["porsche", "land rover", "jaguar", "lexus", "bmw", "mercedes-benz", "audi", "volvo", "mini"], ceiling: 5 * CRORE },
];

const MASS_MARKET_CEILING = 80 * LAKH;

export type PriceAssessment = {
  plausible: boolean;
  reason: string | null;
};

export function assessPrice(
  price: number | null | undefined,
  listing: { make: string; year?: number | null },
): PriceAssessment {
  if (price == null) return { plausible: true, reason: null };
  if (price < MIN_PRICE) return { plausible: false, reason: `price ${price} below floor` };
  if (price > MAX_PRICE) return { plausible: false, reason: `price ${price} above ceiling` };

  const make = listing.make.toLowerCase();
  const segment = SEGMENT_CEILINGS.find((s) => s.makes.includes(make));
  const ceiling = segment?.ceiling ?? MASS_MARKET_CEILING;

  if (price > ceiling) {
    return {
      plausible: false,
      reason: `price ${price} exceeds ${listing.make} ceiling of ${ceiling}`,
    };
  }
  return { plausible: true, reason: null };
}
