/**
 * The cars feed as JSON.
 *
 * The grid fetches through this rather than being server-rendered, so a slow or
 * failed query costs a retry in the browser instead of a half-streamed page.
 */
import { NextResponse } from "next/server";
import { getListings } from "@/app/lib/queries";
import { paramsFromSearch, parseCarFilters } from "@/app/lib/filters";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = paramsFromSearch(new URL(request.url).searchParams);
  try {
    const result = await getListings(parseCarFilters(params));
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[api/listings]", err);
    return NextResponse.json(
      { error: "Could not load listings" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
