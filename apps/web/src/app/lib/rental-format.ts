/**
 * Rental display helpers.
 *
 * Rent is a monthly figure and reads best in the shorthand people actually use
 * — "₹28k/mo", not "₹28,000.00". Deposits are lump sums and are large enough to
 * want lakh notation.
 */

const LABELS: Record<string, string> = {
  unfurnished: "Unfurnished",
  semi_furnished: "Semi-furnished",
  fully_furnished: "Fully furnished",
  independent_house: "Independent house",
  rk: "RK",
  pg: "PG",
  bachelors_male: "Bachelors (male)",
  bachelors_female: "Bachelors (female)",
  both: "Bike & car",
  none: "None",
};

export function rentalLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

/** Compact monthly rent: 28000 -> "28k". */
export function formatRent(rent: number | null | undefined): string | null {
  if (rent == null || rent <= 0) return null;
  if (rent >= 100_000) return `${trim(rent / 100_000)} L`;
  if (rent >= 1_000) return `${trim(rent / 1_000)}k`;
  return String(rent);
}

/** Lump sums read better in lakhs: 200000 -> "2 L". */
export function formatLumpSum(value: number | null | undefined): string | null {
  if (value == null || value <= 0) return null;
  if (value >= 100_000) return `${trim(value / 100_000)} L`;
  if (value >= 1_000) return `${trim(value / 1_000)}k`;
  return String(value);
}

function trim(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function bhkLabel(attrs: {
  bhk: number | null;
  propertyType: string | null;
}): string {
  if (attrs.bhk != null) return `${attrs.bhk} BHK`;
  if (attrs.propertyType === "studio") return "Studio";
  if (attrs.propertyType === "rk") return "1 RK";
  if (attrs.propertyType === "pg") return "PG";
  return rentalLabel(attrs.propertyType);
}

export function rentalTitle(listing: {
  bhk: number | null;
  propertyType: string | null;
  localityName: string | null;
  locationText: string | null;
  city: string;
}): string {
  const where = listing.localityName ?? listing.locationText?.trim() ?? listing.city;
  return `${bhkLabel(listing)} in ${where}`;
}

/** Deposit expressed the way tenants think about it: months of rent. */
export function depositMonths(
  deposit: number | null,
  rent: number | null,
): string | null {
  if (deposit == null || rent == null || rent <= 0) return null;
  const months = deposit / rent;
  if (months < 0.5 || months > 24) return null;
  return `${months < 1.5 ? "1" : Math.round(months)} month${months >= 1.5 ? "s" : ""}`;
}
