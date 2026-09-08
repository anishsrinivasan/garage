import { db, listings } from "@classifieds/db";
import {
  RANKING_WEIGHTS,
  FRESHNESS_HALF_LIFE_DAYS,
  reconcilePrice,
  assessPrice,
} from "@classifieds/shared";
import type {
  ClusterInput,
  CoreListing,
  FacetDefinition,
  MoneyReconciliation,
  Plausibility,
  Spec,
  Vertical,
} from "../types";
import { normalizeListingFields } from "./normalize";
import { CARS_EXTRACTION_PROMPT, CARS_IMAGE_SCORING_PROMPT } from "./prompts";
import { CarExtractionSchema } from "./extraction";
import { eq, inArray } from "drizzle-orm";

export * from "./normalize";
export * from "./premium-makes";
export * from "./prompts";
export * from "./extraction";

/** The car-specific attributes, split out of the core listing row. */
export type CarAttrs = {
  make: string;
  model: string;
  variant: string | null;
  year: number;
  kmDriven: number | null;
  fuelType: string | null;
  transmission: string | null;
  ownerCount: number | null;
  color: string | null;
  bodyType: string | null;
};

/** Km values within the same bucket are treated as the same car. */
const KM_BUCKET = 2_000;

const ENUM_LABELS: Record<string, string> = {
  cng: "CNG",
  lpg: "LPG",
  suv: "SUV",
  muv: "MUV",
};

function label(value: string | null | undefined): string {
  if (!value) return "—";
  return ENUM_LABELS[value.toLowerCase()] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

function formatKm(km: number | null): string {
  if (km == null) return "—";
  if (km >= 100_000) return `${(km / 1000).toFixed(0)}k km`;
  return `${new Intl.NumberFormat("en-IN").format(km)} km`;
}

export const carsVertical: Vertical<CarAttrs> = {
  id: "cars",
  label: "Cars",
  slug: "cars",

  extractionSchema: CarExtractionSchema,
  extractionPrompt: CARS_EXTRACTION_PROMPT,
  imageScoringPrompt: CARS_IMAGE_SCORING_PROMPT,

  normalize(raw) {
    const n = normalizeListingFields({
      make: raw.make,
      model: raw.model,
      variant: raw.variant,
      fuelType: raw.fuelType,
      transmission: raw.transmission,
      bodyType: raw.bodyType,
      color: raw.color,
      city: null,
      sellerPhone: null,
    });
    return {
      ...raw,
      make: n.make,
      model: n.model,
      variant: n.variant,
      fuelType: n.fuelType,
      transmission: n.transmission,
      bodyType: n.bodyType,
      color: n.color,
    };
  },

  reconcileMoney(attrs, caption): MoneyReconciliation<CarAttrs> {
    // Cars carry a single price on the core row, so there is nothing in the
    // attributes to reconcile. Rentals will do real work here — rent, deposit
    // and maintenance all live in attrs and are routinely confused.
    void caption;
    return { attrs, corrected: false, reason: null };
  },

  assessPlausibility(attrs, price): Plausibility {
    return assessPrice(price, { make: attrs.make, year: attrs.year });
  },

  clusterKey(row: ClusterInput<CarAttrs>): string {
    const { attrs } = row;
    const km = attrs.kmDriven == null ? "na" : Math.round(attrs.kmDriven / KM_BUCKET);
    return [
      attrs.make.toLowerCase().trim(),
      attrs.model.toLowerCase().trim(),
      attrs.year,
      row.orgId ?? "no-org",
      km,
    ].join("|");
  },

  ranking: { ...RANKING_WEIGHTS, freshnessHalfLifeDays: FRESHNESS_HALF_LIFE_DAYS },

  /**
   * Until migration 0012 lands, car attributes still live as columns on
   * `car_listings`. These two functions are the only place that knows it, which
   * is what lets the table split happen without touching the pipeline.
   */
  async persistAttrs(listingId, attrs) {
    await db
      .update(listings)
      .set({
        make: attrs.make,
        model: attrs.model,
        variant: attrs.variant,
        year: attrs.year,
        kmDriven: attrs.kmDriven,
        fuelType: attrs.fuelType,
        transmission: attrs.transmission,
        ownerCount: attrs.ownerCount,
        color: attrs.color,
        bodyType: attrs.bodyType,
      })
      .where(eq(listings.id, listingId));
  },

  async loadAttrs(listingIds) {
    if (listingIds.length === 0) return new Map();
    const rows = await db
      .select({
        id: listings.id,
        make: listings.make,
        model: listings.model,
        variant: listings.variant,
        year: listings.year,
        kmDriven: listings.kmDriven,
        fuelType: listings.fuelType,
        transmission: listings.transmission,
        ownerCount: listings.ownerCount,
        color: listings.color,
        bodyType: listings.bodyType,
      })
      .from(listings)
      .where(inArray(listings.id, listingIds));
    return new Map(rows.map(({ id, ...attrs }) => [id, attrs as CarAttrs]));
  },

  title(_listing: CoreListing, attrs) {
    return `${attrs.make} ${attrs.model}`;
  },

  subtitle(_listing, attrs) {
    return attrs.variant;
  },

  specs(_listing, attrs): Spec[] {
    return [
      { icon: "Gauge", label: "Km driven", value: formatKm(attrs.kmDriven) },
      { icon: "Fuel", label: "Fuel", value: label(attrs.fuelType) },
      { icon: "Settings2", label: "Transmission", value: label(attrs.transmission) },
    ];
  },

  imageAlt(listing, attrs) {
    return [
      attrs.year,
      attrs.make,
      attrs.model,
      attrs.variant,
      listing.city ? `for sale in ${listing.city}` : null,
    ]
      .filter(Boolean)
      .join(" ");
  },

  facets: [
    { kind: "range", key: "price", label: "Price (₹)", minKey: "minPrice", maxKey: "maxPrice" },
    { kind: "range", key: "year", label: "Year", minKey: "minYear", maxKey: "maxYear" },
    { kind: "pills", key: "fuelType", label: "Fuel", source: "distinct", column: "fuel_type" },
    { kind: "pills", key: "transmission", label: "Transmission", source: "distinct", column: "transmission" },
    { kind: "pills", key: "bodyType", label: "Body", source: "distinct", column: "body_type" },
    { kind: "select", key: "make", label: "Make", source: "distinct", column: "make" },
    { kind: "select", key: "garage", label: "Garage", source: "org" },
  ] satisfies FacetDefinition[],
};

/** Re-exported so the scraper can keep using it unchanged. */
export { reconcilePrice };
