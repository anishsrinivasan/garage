/**
 * How a listing describes itself in the dashboard.
 *
 * The core `listings` row reuses the car columns for every vertical, so a
 * rental arrives with `make` already reading "3 BHK in Adyar", `model`
 * repeating the locality, and `year` set to the year the post went up. Rendering
 * `{year} {make} {model}` therefore produced "2026 3 BHK In Gopalapuram
 * Gopalapuram" — under a column headed "Car". Every screen that names a listing
 * goes through here instead.
 */

export type LabelableListing = {
  vertical: string;
  year?: number | null;
  make: string;
  model: string;
  bhk?: number | null;
  location?: string | null;
};

export function listingTitle(row: LabelableListing): string {
  if (row.vertical !== "rentals") {
    return [row.year, row.make, row.model].filter(Boolean).join(" ");
  }
  const size = row.bhk ? `${row.bhk} BHK` : "Property";
  const where = row.location?.trim() || row.model?.trim();
  return where ? `${size} in ${where}` : size;
}

/** Rent is monthly and a sale price is not; saying so avoids a 100x misread. */
export function listingPrice(row: {
  vertical: string;
  price: string | null;
  rent?: number | null;
}): string {
  if (row.vertical === "rentals") {
    const rent = row.rent ?? (row.price ? Number(row.price) : null);
    return rent ? `₹${rent.toLocaleString("en-IN")}/mo` : "—";
  }
  return row.price ? `₹${Number(row.price).toLocaleString("en-IN")}` : "—";
}

/** A flat is "taken", not "sold". */
export function soldLabel(vertical: string): string {
  return vertical === "rentals" ? "taken" : "sold";
}
