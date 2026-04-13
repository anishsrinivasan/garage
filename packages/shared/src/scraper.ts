export type ScraperConfig = {
  name: string;
  baseUrl: string;
  city: string;
  maxPages?: number;
  rateLimit?: { requestsPerMinute: number };
};

export type NormalizedListing = {
  make: string;
  model: string;
  variant?: string;
  year: number | null;
  price: number;
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
  photos: string[];
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
