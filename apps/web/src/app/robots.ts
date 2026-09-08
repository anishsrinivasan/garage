import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Everything is allowed: the index is public, and an agent that reads
 * /llms.txt will use the MCP endpoint rather than crawl these pages, which is
 * cheaper for both sides.
 *
 * /llms.txt is deliberately not listed here. `MetadataRoute.Robots` has no
 * field for it and emitting a second `Allow: /llms.txt` rule adds nothing — the
 * blanket allow already covers it — while making robots.txt read as though the
 * file were special-cased. llms.txt is found by convention at the root.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
