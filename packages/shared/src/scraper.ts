export type ScraperConfig = {
  name: string;
  baseUrl: string;
  city: string;
  maxPages?: number;
  rateLimit?: { requestsPerMinute: number };
};

export type ListingStatus = "priced" | "price_on_request";

export type SaleStatus = "available" | "sold" | "removed";

export type MediaItem = {
  url: string;
  type: "image" | "video";
  mimeType?: string | null;
  posterUrl?: string | null;
};

export type NormalizedListing = {
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
