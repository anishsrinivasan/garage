import type {
  ScraperAdapter,
  ScraperConfig,
  ScrapeResult,
  ScrapeError,
  NormalizedListing,
} from "@preowned-cars/shared";
import { CARS24_CONFIG } from "./cars24-config";

type Cars24Listing = {
  appointmentId?: string;
  carId?: string;
  make: string;
  model: string;
  variant?: string;
  year: number;
  price: number;
  fixedPrice?: number;
  emi?: number;
  km?: number;
  fuel?: string;
  fuelType?: string;
  transmission?: string;
  ownerNo?: number;
  ownerNumber?: number;
  color?: string;
  bodyType?: string;
  city?: string;
  location?: string;
  area?: string;
  imageUrl?: string;
  mainImage?: string;
  images?: string[];
  imagePaths?: string[];
  relativeUrl?: string;
  carUrl?: string;
  sellerType?: string;
  registrationNumber?: string;
  listedDate?: string;
  createdDate?: string;
};

type Cars24ApiResponse = {
  data?: {
    results?: Cars24Listing[];
    content?: Cars24Listing[];
    totalCount?: number;
    total?: number;
    totalPages?: number;
    page?: number;
  };
  results?: Cars24Listing[];
  content?: Cars24Listing[];
  total?: number;
  totalCount?: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveImageUrl(path: string | undefined | null): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `https://fastly-production.24c.in/${path}`;
}

function buildListingUrl(listing: Cars24Listing): string {
  if (listing.relativeUrl) {
    return `${CARS24_CONFIG.baseUrl}${listing.relativeUrl.startsWith("/") ? "" : "/"}${listing.relativeUrl}`;
  }
  if (listing.carUrl) {
    return listing.carUrl.startsWith("http")
      ? listing.carUrl
      : `${CARS24_CONFIG.baseUrl}${listing.carUrl}`;
  }
  const id = listing.appointmentId ?? listing.carId ?? "";
  return `${CARS24_CONFIG.baseUrl}/buy-used-${listing.make}-${listing.model}-cars-${CARS24_CONFIG.citySlug}-${id}/`;
}

function normalizePhotos(listing: Cars24Listing): string[] {
  if (listing.images && listing.images.length > 0) {
    return listing.images.map(resolveImageUrl).filter(Boolean);
  }
  if (listing.imagePaths && listing.imagePaths.length > 0) {
    return listing.imagePaths.map(resolveImageUrl).filter(Boolean);
  }
  const mainImg = resolveImageUrl(listing.imageUrl ?? listing.mainImage);
  return mainImg ? [mainImg] : [];
}

function normalizeListing(raw: Cars24Listing): NormalizedListing | null {
  if (!raw.make || !raw.model || !raw.year || !raw.price) {
    return null;
  }

  const sourceUrl = buildListingUrl(raw);

  return {
    make: raw.make.trim(),
    model: raw.model.trim(),
    variant: raw.variant?.trim() || undefined,
    year: raw.year,
    price: raw.fixedPrice ?? raw.price,
    kmDriven: raw.km ?? undefined,
    fuelType: raw.fuelType ?? raw.fuel ?? undefined,
    transmission: raw.transmission ?? undefined,
    ownerCount: raw.ownerNumber ?? raw.ownerNo ?? undefined,
    color: raw.color ?? undefined,
    bodyType: raw.bodyType ?? undefined,
    location: raw.area ?? raw.location ?? undefined,
    city: raw.city ?? CARS24_CONFIG.city,
    sourcePlatform: "cars24",
    sourceUrl,
    sourceListingId: raw.appointmentId ?? raw.carId ?? undefined,
    sellerType: raw.sellerType ?? "dealer",
    photos: normalizePhotos(raw),
    listedAt: raw.listedDate
      ? new Date(raw.listedDate)
      : raw.createdDate
        ? new Date(raw.createdDate)
        : undefined,
  };
}

function extractListings(body: Cars24ApiResponse): {
  listings: Cars24Listing[];
  total: number;
} {
  const data = body.data ?? body;
  const listings =
    (data as Cars24ApiResponse["data"])?.results ??
    (data as Cars24ApiResponse["data"])?.content ??
    body.results ??
    body.content ??
    [];
  const total =
    (data as Cars24ApiResponse["data"])?.totalCount ??
    (data as Cars24ApiResponse["data"])?.total ??
    body.totalCount ??
    body.total ??
    0;
  return { listings, total };
}

async function fetchPage(
  page: number
): Promise<{ listings: Cars24Listing[]; total: number }> {
  const params = new URLSearchParams({
    sort: "bestmatch",
    serveWarrantyCount: "true",
    storeCityId: CARS24_CONFIG.cityId,
    pinId: CARS24_CONFIG.citySlug,
    city: CARS24_CONFIG.citySlug,
    page: String(page),
    size: String(CARS24_CONFIG.pageSize),
  });

  const url = `${CARS24_CONFIG.apiBaseUrl}/v1/listing?${params}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Referer: `${CARS24_CONFIG.baseUrl}/buy-used-cars-${CARS24_CONFIG.citySlug}/`,
      Origin: CARS24_CONFIG.baseUrl,
    },
    signal: AbortSignal.timeout(CARS24_CONFIG.requestTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Cars24 API returned ${response.status}: ${response.statusText}`);
  }

  const body = (await response.json()) as Cars24ApiResponse;
  return extractListings(body);
}

export function createCars24Adapter(): ScraperAdapter {
  const config: ScraperConfig = {
    name: CARS24_CONFIG.name,
    baseUrl: CARS24_CONFIG.baseUrl,
    city: CARS24_CONFIG.city,
    maxPages: CARS24_CONFIG.maxPages,
    rateLimit: CARS24_CONFIG.rateLimit,
  };

  return {
    name: "cars24",
    config,

    async scrape(): Promise<ScrapeResult> {
      const startTime = Date.now();
      const allListings: NormalizedListing[] = [];
      const errors: ScrapeError[] = [];
      let totalFound = 0;
      let pagesScraped = 0;

      const delayMs = 60000 / CARS24_CONFIG.rateLimit.requestsPerMinute;

      for (let page = 1; page <= CARS24_CONFIG.maxPages; page++) {
        try {
          console.log(`[cars24] Fetching page ${page}...`);
          const { listings: rawListings, total } = await fetchPage(page);

          if (page === 1) {
            totalFound = total;
            console.log(`[cars24] Total listings available: ${total}`);
          }

          if (rawListings.length === 0) {
            console.log(`[cars24] No more listings on page ${page}, stopping.`);
            break;
          }

          pagesScraped++;

          for (const raw of rawListings) {
            const normalized = normalizeListing(raw);
            if (normalized) {
              allListings.push(normalized);
            }
          }

          console.log(
            `[cars24] Page ${page}: ${rawListings.length} raw, ${allListings.length} total normalized`
          );

          if (page < CARS24_CONFIG.maxPages && rawListings.length > 0) {
            await delay(delayMs);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[cars24] Page ${page} failed: ${message}`);
          errors.push({
            url: `${CARS24_CONFIG.apiBaseUrl}/v1/listing?page=${page}`,
            message,
            retryable: !message.includes("403") && !message.includes("401"),
          });

          if (message.includes("403") || message.includes("429")) {
            console.error("[cars24] Rate-limited or blocked, stopping pagination.");
            break;
          }
        }
      }

      return {
        listings: allListings,
        errors,
        metadata: {
          pagesScraped,
          totalFound,
          durationMs: Date.now() - startTime,
        },
      };
    },

    async healthCheck(): Promise<boolean> {
      try {
        const { listings } = await fetchPage(1);
        return listings.length > 0;
      } catch {
        return false;
      }
    },
  };
}
