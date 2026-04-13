export const CARS24_CONFIG = {
  name: "cars24",
  baseUrl: "https://www.cars24.com",
  city: "Chennai",
  citySlug: "chennai",
  maxPages: 1,
  pageSize: 20,
  rateLimit: { requestsPerMinute: 10 },
  requestTimeoutMs: 30000,
} as const;
