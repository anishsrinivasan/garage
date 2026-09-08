import type { ZodType } from "zod";
import type { RankingWeights } from "@preowned-cars/shared";

/**
 * The contract every vertical implements.
 *
 * The pipeline never branches on vertical — it asks the vertical. Adding resale
 * property later means writing one of these plus an attributes table; it does
 * not mean touching ingestion, media handling, freshness or dedupe.
 */

export type VerticalId = "cars" | "rentals" | "resale";

/** Fields the core `listings` row carries for every vertical. */
export type CoreListing = {
  id: string;
  vertical: VerticalId;
  /** Cars: asking price. Rentals: monthly rent. Always minor units. */
  price: string | null;
  pricePeriod: "once" | "month";
  city: string;
  locationText: string | null;
  saleStatus: string;
  listingStatus: string;
  sourcePlatform: string;
  sourceUrl: string;
  description: string | null;
  media: unknown;
  heroMediaUrl: string | null;
  listedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  orgName?: string | null;
};

export type Spec = {
  /** lucide-react icon name, resolved by the UI. */
  icon: string;
  label: string;
  value: string;
};

export type FacetDefinition =
  | { kind: "pills"; key: string; label: string; source: "distinct"; column: string }
  | { kind: "range"; key: string; label: string; minKey: string; maxKey: string; unit?: string }
  | { kind: "select"; key: string; label: string; source: "distinct" | "org"; column?: string };

export type MoneyReconciliation<TAttrs> = {
  attrs: TAttrs;
  corrected: boolean;
  reason: string | null;
};

export type Plausibility = {
  plausible: boolean;
  reason: string | null;
};

/**
 * Rows the clusterer sees. The vertical's `clusterKey` is the only thing that
 * knows which of these fields identify "the same item".
 */
export type ClusterInput<TAttrs> = {
  id: string;
  orgId: string | null;
  price: string | null;
  attrs: TAttrs;
};

export interface Vertical<TAttrs> {
  readonly id: VerticalId;
  readonly label: string;
  /** URL segment: /cars, /rent. */
  readonly slug: string;

  // --- ingestion -----------------------------------------------------------
  /** What the extraction model returns per post. */
  readonly extractionSchema: ZodType<unknown>;
  readonly extractionPrompt: string;
  /** Rubric for the hero-image vision pass. */
  readonly imageScoringPrompt: string;

  // --- normalisation -------------------------------------------------------
  normalize(raw: TAttrs): TAttrs;
  /**
   * Re-reads the source caption deterministically and prefers it when the model
   * disagrees by a clean power of ten. This is what caught a ₹45 lakh car being
   * stored as ₹4.5 crore.
   */
  reconcileMoney(attrs: TAttrs, caption: string | null): MoneyReconciliation<TAttrs>;
  assessPlausibility(attrs: TAttrs, price: number | null): Plausibility;

  // --- lifecycle -----------------------------------------------------------
  clusterKey(row: ClusterInput<TAttrs>): string;
  readonly ranking: RankingWeights & { freshnessHalfLifeDays: number };

  // --- persistence ---------------------------------------------------------
  /** The core never touches an attributes table directly. */
  persistAttrs(listingId: string, attrs: TAttrs): Promise<void>;
  loadAttrs(listingIds: string[]): Promise<Map<string, TAttrs>>;

  // --- presentation --------------------------------------------------------
  title(listing: CoreListing, attrs: TAttrs): string;
  subtitle(listing: CoreListing, attrs: TAttrs): string | null;
  specs(listing: CoreListing, attrs: TAttrs): Spec[];
  /** Alt text for the hero image. */
  imageAlt(listing: CoreListing, attrs: TAttrs): string;
  readonly facets: FacetDefinition[];
}
