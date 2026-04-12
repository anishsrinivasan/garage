export const INSTAGRAM_DEALER_HANDLES = [
  "chennai_preowned_cars",
  "chennai_used_cars_hub",
  "chennaiusedcardealers",
  "premiumcars_chennai",
  "motormartchennai",
];

export const INSTAGRAM_CONFIG = {
  name: "instagram",
  baseUrl: "https://www.instagram.com",
  city: "Chennai",
  maxPages: 12,
  rateLimit: { requestsPerMinute: 10 },
  postsPerAccount: 20,
  scrollDelayMs: 2000,
  navigationTimeoutMs: 30000,
} as const;
