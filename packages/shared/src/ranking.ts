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

/**
 * Days for a car's recency multiplier to decay halfway to its floor.
 *
 * Was 30, which put the halfway point outside the window anyone actually
 * browses — a fortnight-old listing scored 0.76 against a same-day 1.00, a gap
 * the media and price multipliers erased on their own. At 14 the curve bites
 * inside the period where a preowned car is still plausibly available.
 */
export const FRESHNESS_HALF_LIFE_DAYS = 14;

/**
 * The same knob for rentals, which go off faster than cars do.
 *
 * A flat listed three weeks ago is usually taken; a car listed three weeks ago
 * usually is not. Lived next to the cars value rather than in the rentals query
 * so the two can be compared, and so one cannot be tuned in ignorance of the
 * other.
 */
export const RENTALS_HALF_LIFE_DAYS = 7;

/** Beyond this, a listing is assumed gone unless a scrape re-confirms it. */
export const STALE_AFTER_DAYS = 45;

/** Beyond this, we stop showing it in the default feed entirely. */
export const EXPIRE_AFTER_DAYS = 120;

/**
 * Floor for the recency multiplier.
 *
 * This is the knob that decides how much "recent" beats "good", and it has to
 * be read against the quality multipliers below: hasMedia, hasPrice and
 * hasScoredMedia compound to about 2.2x. At a floor of 0.35 the whole recency
 * range was only 2.9x, so a fully-specced listing from any date beat a thinner
 * one from today — the feed sorted by completeness with a recency tint.
 *
 * At 0.15 the range is 6.7x and outruns that stack, which is the intent: this
 * index's whole claim is that its listings are current. A same-day listing now
 * leads a month-old one even when the older one is better documented.
 *
 * Not zero, and not the 0.05 this once had. That made age the only thing that
 * mattered: everything past a few weeks collapsed onto the floor and competed
 * on a hundredth of the scale, so a same-day batch of near-identical
 * hatchbacks took the entire front page.
 */
export const MIN_RECENCY_MULTIPLIER = 0.15;

/**
 * Price bands, as a gentle multiplier rather than a sort key.
 *
 * Price used to be an ordering key above recency, which pinned the single most
 * expensive row to the top forever. Dropping it entirely went too far the other
 * way. As a band multiplier it expresses "this audience came for the interesting
 * cars" without letting one outlier dominate, and a bad parse costs a few
 * positions instead of the whole front page.
 */
/**
 * Best match favours the affordable end.
 *
 * These tiers used to run the other way — a ₹50L car scored 1.45 against a
 * ₹4L one — on the theory that people came to look at interesting cars. As a
 * marketplace that is backwards: someone browsing without a filter is far more
 * likely to be shopping than window-shopping, and the top of the feed should
 * be things they could actually buy. Paired with the recency curve, "best
 * match" now means cheap and recently posted.
 *
 * The spread is deliberately gentle (1.2 to 0.8). A stronger tilt would bury
 * every premium listing regardless of how good it is, and price is one signal
 * among several here, not a sort.
 */
export const PRICE_TIERS: Array<{ min: number; multiplier: number }> = [
  { min: 50_00_000, multiplier: 0.8 },
  { min: 25_00_000, multiplier: 0.9 },
  { min: 10_00_000, multiplier: 1.0 },
  { min: 0, multiplier: 1.2 },
];

export function priceTierMultiplier(price: number | null | undefined): number {
  if (price == null) return 1;
  return PRICE_TIERS.find((tier) => price >= tier.min)?.multiplier ?? 1;
}

export type RankingWeights = typeof RANKING_WEIGHTS;

export const RANKING_WEIGHTS = {
  /**
   * Near-neutral. A marque boost pulls in the opposite direction to the price
   * tiers above — premium makes are exactly the expensive listings — so leaving
   * it at 1.25 would have cancelled out the change. Kept slightly above 1
   * because a well-known marque is still a mild quality signal.
   */
  premiumMake: 1.05,
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
