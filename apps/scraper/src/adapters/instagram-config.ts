export const INSTAGRAM_CONFIG = {
  name: "instagram",
  baseUrl: "https://www.instagram.com",
  city: "Chennai",
  maxPages: 12,
  rateLimit: { requestsPerMinute: 10 },
  postsPerAccount: 20,
  scrollDelayMs: 2000,
  navigationTimeoutMs: 30000,
  recheckAfterHours: 48,
  postFetchConcurrency: 4,
  postFetchStaggerMs: 400,
} as const;

export const INSTAGRAM_DEALER_HANDLES: string[] = [
  "germanmechatronics",
];
