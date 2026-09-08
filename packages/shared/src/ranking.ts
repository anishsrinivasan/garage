/**
 * Feed ranking and freshness policy — one place so the web feed, the delist
 * sweep and the admin dashboard all agree on what "stale" means.
 *
 * The old default order was `available → has-media → premium-brand → price DESC
 * → scrapedAt DESC`. Because price outranked recency by two positions, the most
 * expensive row in the table was pinned to slot 1 forever, which is how a
 * 16-week-old listing ended up as the first card. Recency is now a continuous
 * exponential decay applied to a quality score, and price is only a tie-breaker
 * inside a freshness band.
 */

/** Days for the recency multiplier to decay halfway to its floor. */
export const FRESHNESS_HALF_LIFE_DAYS = 30;

/** Beyond this, a listing is assumed gone unless a scrape re-confirms it. */
export const STALE_AFTER_DAYS = 45;

/** Beyond this, we stop showing it in the default feed entirely. */
export const EXPIRE_AFTER_DAYS = 120;

/**
 * Floor for the recency multiplier.
 *
 * This is the knob that decides how much "recent" beats "good". At 0.05 an
 * unbounded exponential made age the only thing that mattered: a same-day batch
 * of ₹3 lakh hatchbacks buried every premium listing more than a few weeks old,
 * because everything older had collapsed to the floor and was competing on a
 * hundredth of the scale. At 0.35 the range is compressed enough that a
 * well-photographed premium car from last month can still outrank a bare
 * mass-market listing posted this morning — which is the intended mix of
 * price and date, rather than a pure date sort wearing a score's clothing.
 */
export const MIN_RECENCY_MULTIPLIER = 0.35;

/**
 * Price bands, as a gentle multiplier rather than a sort key.
 *
 * Price used to be an ordering key above recency, which pinned the single most
 * expensive row to the top forever. Dropping it entirely went too far the other
 * way. As a band multiplier it expresses "this audience came for the interesting
 * cars" without letting one outlier dominate, and a bad parse costs a few
 * positions instead of the whole front page.
 */
export const PRICE_TIERS: Array<{ min: number; multiplier: number }> = [
  { min: 50_00_000, multiplier: 1.45 },
  { min: 25_00_000, multiplier: 1.3 },
  { min: 10_00_000, multiplier: 1.15 },
  { min: 0, multiplier: 1.0 },
];

export function priceTierMultiplier(price: number | null | undefined): number {
  if (price == null) return 1;
  return PRICE_TIERS.find((tier) => price >= tier.min)?.multiplier ?? 1;
}

export type RankingWeights = typeof RANKING_WEIGHTS;

export const RANKING_WEIGHTS = {
  premiumMake: 1.25,
  hasMedia: 1.6,
  /** Media that survived vision scoring beats an unvetted 8-image dump. */
  hasScoredMedia: 1.15,
  hasPrice: 1.2,
  /** km + fuel + transmission + body all present. */
  completeSpecs: 1.1,
  soldPenalty: 0.05,
  stalePenalty: 0.4,
  needsReviewPenalty: 0.3,
} as const;

export type FreshnessBucket = "today" | "week" | "month" | "quarter" | "older";

export const FRESHNESS_WINDOWS: Record<Exclude<FreshnessBucket, "older">, number> = {
  today: 1,
  week: 7,
  month: 30,
  quarter: 90,
};

export function freshnessBucket(ageDays: number): FreshnessBucket {
  if (ageDays <= FRESHNESS_WINDOWS.today) return "today";
  if (ageDays <= FRESHNESS_WINDOWS.week) return "week";
  if (ageDays <= FRESHNESS_WINDOWS.month) return "month";
  if (ageDays <= FRESHNESS_WINDOWS.quarter) return "quarter";
  return "older";
}

export function daysBetween(from: Date | string, to: Date = new Date()): number {
  const start = from instanceof Date ? from : new Date(from);
  return Math.max(0, (to.getTime() - start.getTime()) / 86_400_000);
}

/** "Today" / "3d ago" / "2w ago" / "3mo ago" — what the card chip renders. */
export function relativeAge(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const days = Math.floor(daysBetween(date));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export type AgeTone = "fresh" | "recent" | "aging" | "stale";

export function ageTone(date: Date | string | null | undefined): AgeTone {
  if (!date) return "stale";
  const days = daysBetween(date);
  if (days <= 7) return "fresh";
  if (days <= 30) return "recent";
  if (days <= STALE_AFTER_DAYS) return "aging";
  return "stale";
}
