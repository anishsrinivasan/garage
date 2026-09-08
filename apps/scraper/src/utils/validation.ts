import type { MediaItem, NormalizedListing } from "@classifieds/shared";
import { MIN_PRICE, MAX_PRICE, MIN_RENT, MAX_RENT } from "@classifieds/shared";

const MIN_YEAR = 1990;
const MAX_YEAR = new Date().getFullYear() + 1;
const MAX_KM = 2_000_000;

const URL_REGEX = /^https?:\/\/.+/;

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  sanitizedMedia?: MediaItem[];
};

export function validateListing(listing: NormalizedListing): ValidationResult {
  const errors: string[] = [];

  if (!listing.make || listing.make.trim() === "") {
    errors.push("make is empty");
  }

  if (!listing.model || listing.model.trim() === "") {
    errors.push("model is empty");
  }

  if (listing.price != null) {
    // A monthly rent and a sale price are different quantities and need
    // different bounds; sharing them rejected genuine sub-₹25,000 rents.
    const isRent = listing.vertical === "rentals";
    const min = isRent ? MIN_RENT : MIN_PRICE;
    const max = isRent ? MAX_RENT : MAX_PRICE;
    if (listing.price < min || listing.price > max) {
      errors.push(
        `${isRent ? "rent" : "price"} ${listing.price} outside ₹${min}–₹${max} range`,
      );
    }
  }

  if (listing.year == null) {
    errors.push("year is missing");
  } else if (listing.year < MIN_YEAR || listing.year > MAX_YEAR) {
    errors.push(`year ${listing.year} outside ${MIN_YEAR}–${MAX_YEAR} range`);
  }

  if (listing.kmDriven != null && (listing.kmDriven < 0 || listing.kmDriven > MAX_KM)) {
    errors.push(`kmDriven ${listing.kmDriven} outside 0–${MAX_KM} range`);
  }

  const inputMedia = listing.media ?? [];
  const seenUrls = new Set<string>();
  const sanitizedMedia = inputMedia.filter((m) => {
    if (!m || typeof m.url !== "string" || !URL_REGEX.test(m.url)) return false;
    if (m.type !== "image" && m.type !== "video") return false;
    // The same photo arriving twice at different CDN widths used to occupy two
    // gallery slots.
    const key = m.url.split("?")[0]!;
    if (seenUrls.has(key)) return false;
    seenUrls.add(key);
    return true;
  });
  const invalidCount = inputMedia.length - sanitizedMedia.length;
  if (invalidCount > 0) {
    errors.push(`${invalidCount} invalid media item(s) filtered`);
  }

  const hasBlockingErrors = errors.some(
    (e) => !e.includes("invalid media item(s) filtered"),
  );

  return {
    valid: !hasBlockingErrors,
    errors,
    sanitizedMedia,
  };
}
