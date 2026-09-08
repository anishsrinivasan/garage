import { relativeAge, ageTone, daysBetween, type AgeTone } from "@classifieds/shared";

export { relativeAge, ageTone, daysBetween };
export type { AgeTone };

/**
 * Indian price shorthand. Returns the number only — callers supply the ₹ so
 * "Price on request" doesn't end up rendered as "₹Price on request", which is
 * what the old single-string version did on 32% of listings.
 */
export function formatPrice(
  price: string | number | null | undefined,
): string | null {
  if (price == null || price === "") return null;
  const num = typeof price === "string" ? parseFloat(price) : price;
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num >= 10_000_000) return `${trimZeros(num / 10_000_000)} Cr`;
  if (num >= 100_000) return `${trimZeros(num / 100_000)} L`;
  return new Intl.NumberFormat("en-IN").format(num);
}

/** `4.50 L` reads worse than `4.5 L`; `10.00 L` worse than `10 L`. */
function trimZeros(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/** Full rupee figure for tooltips, schema.org, and the detail page. */
export function exactPrice(price: string | number | null | undefined): number | null {
  if (price == null || price === "") return null;
  const num = typeof price === "string" ? parseFloat(price) : price;
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function isPricedListing(
  price: string | number | null | undefined,
): boolean {
  return exactPrice(price) != null;
}

export function formatKm(km: number | null | undefined): string {
  if (km == null) return "—";
  if (km >= 100_000) return `${(km / 1000).toFixed(0)}k km`;
  return `${new Intl.NumberFormat("en-IN").format(km)} km`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function capitalize(s: string | null | undefined): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Enum values are stored lowercase. Plain capitalisation renders "suv" as "Suv"
 * and "cng" as "Cng", so acronyms need a real label rather than a text
 * transform. Anything not listed falls back to capitalisation.
 */
const ENUM_LABELS: Record<string, string> = {
  cng: "CNG",
  lpg: "LPG",
  suv: "SUV",
  muv: "MUV",
};

export function enumLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return ENUM_LABELS[value.toLowerCase()] ?? capitalize(value);
}

/**
 * Alt text that describes the car rather than repeating the heading. The cards
 * previously shipped `alt="BMW X7"` and the detail gallery shipped `alt=""`.
 */
export function imageAlt(listing: {
  year: number;
  make: string;
  model: string;
  variant?: string | null;
  city?: string | null;
}): string {
  return [
    listing.year,
    listing.make,
    listing.model,
    listing.variant,
    listing.city ? `for sale in ${listing.city}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
