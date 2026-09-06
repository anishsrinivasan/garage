export const CARDEKHO_CONFIG = {
  name: "cardekho",
  baseUrl: "https://www.cardekho.com",
  searchPath: "/used-cars+in+chennai",
  city: "Chennai",
  // CarDekho paginates client-side: /page-2, ?page=2, ?pn=2 and ?pageNo=2 all
  // return byte-identical server-rendered HTML containing the same first 20
  // cars. Requesting 20 pages therefore fetched the same listings twenty times,
  // burned two minutes per run, and made every run look like it had covered
  // 16% of the catalogue — which correctly tripped the delist sweep's
  // degraded-run guard. Going deeper needs their XHR endpoint or a headless
  // browser; until then, ask for the one page that actually exists.
  maxPages: 1,
  rateLimit: { requestsPerMinute: 10 },
  requestTimeoutMs: 30000,
} as const;
