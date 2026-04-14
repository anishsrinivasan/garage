export const OLX_CONFIG = {
  name: "olx",
  baseUrl: "https://www.olx.in",
  searchPath: "/cars_c84",
  city: "Chennai",
  cityParam: "chennai_g4058528",
  maxPages: 5,
  rateLimit: { requestsPerMinute: 6 },
  pageLoadTimeoutMs: 30000,
  navigationTimeoutMs: 15000,
} as const;
