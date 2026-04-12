export const CARS24_CONFIG = {
  name: "cars24",
  baseUrl: "https://www.cars24.com",
  apiBaseUrl: "https://listing-service.cars24.com/api",
  city: "Chennai",
  cityId: "2",
  citySlug: "chennai",
  maxPages: 20,
  pageSize: 25,
  rateLimit: { requestsPerMinute: 15 },
  requestTimeoutMs: 30000,
} as const;
