import { eq, inArray } from "drizzle-orm";
import { db, listingRentalAttrs } from "@preowned-cars/db";
import { RANKING_WEIGHTS } from "@preowned-cars/shared";
import type {
  ClusterInput,
  CoreListing,
  FacetDefinition,
  MoneyReconciliation,
  Plausibility,
  Spec,
  Vertical,
} from "../types";
import { RENTALS_EXTRACTION_PROMPT, RENTALS_IMAGE_SCORING_PROMPT } from "./prompts";
import { RentalPostSchema } from "./extraction";
import { reconcileRentalMoney, assessRentalMoney } from "./money";

export * from "./money";
export * from "./locality";
export * from "./prompts";
export * from "./extraction";

export type RentalAttrs = {
  bhk: number | null;
  propertyType: string | null;
  carpetAreaSqft: number | null;
  floor: number | null;
  totalFloors: number | null;
  rent: number | null;
  deposit: number | null;
  maintenance: number | null;
  maintenanceIncluded: boolean | null;
  furnishing: string | null;
  tenantPreference: string | null;
  parking: string | null;
  availableFrom: string | null;
  amenities: string[];
};

/** Carpet areas within this many sqft are treated as the same unit. */
const AREA_BUCKET = 100;

const LABELS: Record<string, string> = {
  unfurnished: "Unfurnished",
  semi_furnished: "Semi-furnished",
  fully_furnished: "Fully furnished",
  independent_house: "Independent house",
  rk: "RK",
  pg: "PG",
  bachelors_male: "Bachelors (male)",
  bachelors_female: "Bachelors (female)",
};

function label(value: string | null): string {
  if (!value) return "—";
  return LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function formatMoney(value: number | null): string {
  if (value == null) return "—";
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2).replace(/\.?0+$/, "")} L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(0)}k`;
  return `₹${value}`;
}

function bhkLabel(attrs: RentalAttrs): string {
  if (attrs.bhk != null) return `${attrs.bhk} BHK`;
  if (attrs.propertyType === "studio") return "Studio";
  if (attrs.propertyType === "rk") return "1 RK";
  return label(attrs.propertyType);
}

export const rentalsVertical: Vertical<RentalAttrs> = {
  id: "rentals",
  label: "Rentals",
  slug: "rent",

  extractionSchema: RentalPostSchema,
  extractionPrompt: RENTALS_EXTRACTION_PROMPT,
  imageScoringPrompt: RENTALS_IMAGE_SCORING_PROMPT,

  normalize(raw) {
    return {
      ...raw,
      amenities: [
        ...new Set(raw.amenities.map((a) => a.toLowerCase().trim()).filter(Boolean)),
      ].sort(),
    };
  },

  /**
   * Where cars had nothing to do — one price on the core row — rentals do the
   * real work. Rent, deposit and maintenance are three numbers in one caption,
   * and a deposit stored as rent lands the listing in entirely the wrong price
   * band.
   */
  reconcileMoney(attrs, caption): MoneyReconciliation<RentalAttrs> {
    const { money, corrected, reason } = reconcileRentalMoney(
      {
        rent: attrs.rent,
        deposit: attrs.deposit,
        maintenance: attrs.maintenance,
        maintenanceIncluded: attrs.maintenanceIncluded,
      },
      caption,
    );
    return { attrs: { ...attrs, ...money }, corrected, reason };
  },

  assessPlausibility(attrs): Plausibility {
    return assessRentalMoney({
      rent: attrs.rent,
      deposit: attrs.deposit,
      maintenance: attrs.maintenance,
      maintenanceIncluded: attrs.maintenanceIncluded,
    });
  },

  /**
   * Groups reposts of the same unit by one broker: layout and floor area, which
   * do not change between postings.
   *
   * **Rent is deliberately not in the key**, for the same reason price is absent
   * from the cars key — a revised rent is precisely when a broker reposts, and
   * including it would split the duplicate rather than collapse it. Bucketing
   * rent does not rescue this either: any fixed bucket has boundaries, and 28,000
   * and 29,000 straddle one at every band width worth using.
   *
   * **This does not catch the same flat listed by different brokers.** That is
   * the genuinely hard case cars never had — different photos, different quoted
   * rent, different phone number — and a grouping key cannot solve it. It needs
   * perceptual hashing over the photos to spot the re-used image. Tracked as a
   * follow-up rather than pretended away here.
   */
  clusterKey(row: ClusterInput<RentalAttrs>): string {
    const { attrs } = row;
    return [
      row.orgId ?? "no-org",
      attrs.bhk ?? attrs.propertyType ?? "na",
      attrs.carpetAreaSqft == null
        ? "na"
        : Math.round(attrs.carpetAreaSqft / AREA_BUCKET),
      attrs.floor ?? "na",
    ].join("|");
  },

  // Rental listings die in a fortnight, not a quarter. This is the single most
  // load-bearing difference between the two verticals.
  ranking: { ...RANKING_WEIGHTS, freshnessHalfLifeDays: 7 },

  async persistAttrs(listingId, attrs) {
    const values = { listingId, ...attrs, amenities: attrs.amenities ?? [] };
    await db
      .insert(listingRentalAttrs)
      .values(values)
      .onConflictDoUpdate({ target: listingRentalAttrs.listingId, set: values });
  },

  async loadAttrs(listingIds) {
    if (listingIds.length === 0) return new Map();
    const rows = await db
      .select()
      .from(listingRentalAttrs)
      .where(inArray(listingRentalAttrs.listingId, listingIds));
    return new Map(
      rows.map(({ listingId, ...attrs }) => [listingId, attrs as RentalAttrs]),
    );
  },

  title(listing: CoreListing, attrs) {
    const where = listing.locationText?.trim() || listing.city;
    return `${bhkLabel(attrs)} in ${where}`;
  },

  subtitle(_listing, attrs) {
    const parts = [
      attrs.furnishing ? label(attrs.furnishing) : null,
      attrs.carpetAreaSqft ? `${attrs.carpetAreaSqft} sqft` : null,
      attrs.floor != null
        ? `Floor ${attrs.floor}${attrs.totalFloors ? ` of ${attrs.totalFloors}` : ""}`
        : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
  },

  specs(_listing, attrs): Spec[] {
    return [
      {
        icon: "Wallet",
        label: "Deposit",
        value: attrs.deposit != null ? formatMoney(attrs.deposit) : "—",
      },
      {
        icon: "Sofa",
        label: "Furnishing",
        value: label(attrs.furnishing),
      },
      {
        icon: "Users",
        label: "Tenants",
        value: label(attrs.tenantPreference),
      },
    ];
  },

  imageAlt(listing, attrs) {
    return [
      bhkLabel(attrs),
      attrs.furnishing ? label(attrs.furnishing).toLowerCase() : null,
      "for rent in",
      listing.locationText?.trim() || listing.city,
    ]
      .filter(Boolean)
      .join(" ");
  },

  facets: [
    { kind: "range", key: "rent", label: "Rent (₹/month)", minKey: "minRent", maxKey: "maxRent" },
    { kind: "pills", key: "bhk", label: "Bedrooms", source: "distinct", column: "bhk" },
    { kind: "pills", key: "furnishing", label: "Furnishing", source: "distinct", column: "furnishing" },
    { kind: "pills", key: "propertyType", label: "Property", source: "distinct", column: "property_type" },
    { kind: "pills", key: "tenantPreference", label: "Tenants", source: "distinct", column: "tenant_preference" },
    { kind: "range", key: "area", label: "Carpet area (sqft)", minKey: "minArea", maxKey: "maxArea" },
    { kind: "select", key: "locality", label: "Locality", source: "distinct", column: "locality_id" },
  ] satisfies FacetDefinition[],
};
