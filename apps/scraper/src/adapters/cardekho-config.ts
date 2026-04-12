export const CARDEKHO_CONFIG = {
  name: "cardekho",
  baseUrl: "https://www.cardekho.com",
  searchPath: "/used-cars+in+chennai",
  city: "Chennai",
  maxPages: 20,
  rateLimit: { requestsPerMinute: 10 },
  requestTimeoutMs: 30000,
} as const;
