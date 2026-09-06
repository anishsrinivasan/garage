import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Cache-busting hook for the scraper.
 *
 * The feed and the filter options are cached under the `listings` tag rather
 * than being recomputed per request. The cron service calls this once a run
 * finishes so new listings appear immediately instead of waiting out the
 * revalidation window.
 *
 * Shared-secret auth: set REVALIDATE_SECRET in both this app and the cron
 * service. Without the secret configured the route refuses rather than running
 * open, so a missed env var can't turn into a public cache-flush endpoint.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "REVALIDATE_SECRET is not configured" },
      { status: 503 },
    );
  }

  const provided =
    request.headers.get("x-revalidate-secret") ??
    new URL(request.url).searchParams.get("secret");

  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  revalidateTag("listings");
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
