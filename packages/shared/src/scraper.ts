export type ScraperConfig = {
  name: string;
  baseUrl: string;
  city: string;
  maxPages?: number;
  rateLimit?: { requestsPerMinute: number };
};

export type ListingStatus = "priced" | "price_on_request";

export type SaleStatus = "available" | "sold" | "removed";

/**
 * Where a media item came from. Needed because Instagram reel "cover" images
 * have a play triangle burned into the pixels and are usually a frame of the
 * dealer talking rather than the car — so they must never win the hero slot
 * when a real carousel photo or an extracted video frame is available.
 */
export type MediaSource =
  | "carousel"
  | "reel_cover"
  | "reel_frame"
  | "marketplace"
  | "manual";

export type MediaItem = {
  url: string;
  type: "image" | "video";
  mimeType?: string | null;
  posterUrl?: string | null;
  source?: MediaSource | null;
  width?: number | null;
  height?: number | null;
  /** 0-100 from the vision pass; higher means more car-forward. */
  score?: number | null;
  /** Why the scorer rated it as it did — kept for admin debugging. */
  scoreReason?: string | null;
};

/**
 * A listing as an adapter produces it: the core fields every vertical shares,
 * plus an opaque `attrs` bag the owning vertical understands.
 *
 * The car fields below are retained while the cars adapters still populate them
 * directly; they are ignored for any other vertical. New verticals put
 * everything domain-specific in `attrs`.
 */
export type NormalizedListing = {
  /** Which vertical owns this row. Defaults to cars for the legacy adapters. */
  vertical?: string;
  /** Domain-specific fields, persisted by the vertical's persistAttrs. */
  attrs?: unknown;
  /** Free-text location as written by the seller, before locality resolution. */
  locationText?: string | null;
  localityId?: string | null;
  cityId?: string | null;
  /** "once" for a sale price, "month" for rent. */
  pricePeriod?: "once" | "month";

  make: string;
  model: string;
  variant?: string;
  year: number | null;
  price: number | null;
  listingStatus?: ListingStatus;
  saleStatus?: SaleStatus;
  soldAt?: Date | null;
  dealerSourceId?: string;
  garageId?: string;
  kmDriven?: number;
  fuelType?: string;
  transmission?: string;
  ownerCount?: number;
  color?: string;
  bodyType?: string;
  location?: string;
  city: string;
  sourcePlatform: string;
  sourceUrl: string;
  sourceListingId?: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerType?: string;
  media: MediaItem[];
  description?: string;
  listedAt?: Date;
  /** Set when the price was corrected or flagged during extraction. */
  needsReview?: boolean;
  reviewReason?: string | null;
};

export type ScrapeResult = {
  listings: NormalizedListing[];
  errors: ScrapeError[];
  metadata: { pagesScraped: number; totalFound: number; durationMs: number };
};

export type ScrapeError = {
  url: string;
  message: string;
  retryable: boolean;
};

export type ScraperAdapter = {
  readonly name: string;
  readonly config: ScraperConfig;
  scrape(): Promise<ScrapeResult>;
  healthCheck(): Promise<boolean>;
};
