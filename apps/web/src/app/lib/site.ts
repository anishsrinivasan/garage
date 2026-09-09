/**
 * Facts about this deployment that the standing pages quote.
 *
 * The contact address is read from the environment rather than hard-coded: a
 * takedown or privacy page that prints the wrong address is worse than one that
 * routes people to the in-app report control, so an unset variable falls back
 * to that instead of inventing an inbox.
 */
/**
 * The site's own public origin, used for canonical URLs, the sitemap, robots,
 * Open Graph tags and the MCP connection snippet.
 *
 * NEXT_PUBLIC_SITE_URL is the setting; the rest is a safety net. Every caller
 * used to fall back to `http://localhost:3000` on its own, so with the variable
 * unset in production the sitemap and robots.txt were handing crawlers
 * localhost URLs. Vercel always sets VERCEL_PROJECT_PRODUCTION_URL, so the
 * fallback resolves to the real domain there even if nobody sets anything.
 *
 * Note this is only correct in server code: VERCEL_PROJECT_PRODUCTION_URL has
 * no NEXT_PUBLIC_ prefix, so it is not inlined into client bundles. Every
 * caller here is a server component, route handler or metadata export.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? null;

/** The marketplaces and platforms listings are collected from. */
export const SOURCES = [
  "Instagram dealer and broker accounts",
  "OLX",
  "Cars24",
  "CarDekho",
] as const;
