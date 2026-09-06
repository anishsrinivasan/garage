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

/** Days for the recency multiplier to halve. */
export const FRESHNESS_HALF_LIFE_DAYS = 21;

/** Beyond this, a listing is assumed gone unless a scrape re-confirms it. */
export const STALE_AFTER_DAYS = 45;

/** Beyond this, we stop showing it in the default feed entirely. */
export const EXPIRE_AFTER_DAYS = 120;

/** Recency multiplier floor, so an old-but-perfect listing never scores zero. */
export const MIN_RECENCY_MULTIPLIER = 0.05;

/**
 * Premium marques get a modest boost because they're what this audience comes
 * for — but a multiplier, not a sort key, so a fresh mass-market listing can
 * still outrank a stale premium one.
 */
export const PREMIUM_MAKES = [
  "bmw",
  "mercedes-benz",
  "audi",
  "porsche",
  "lexus",
  "jaguar",
  "land rover",
  "volvo",
  "mini",
  "lamborghini",
  "ferrari",
  "bentley",
  "rolls-royce",
  "maserati",
  "aston martin",
  "mclaren",
  "lotus",
] as const;

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
