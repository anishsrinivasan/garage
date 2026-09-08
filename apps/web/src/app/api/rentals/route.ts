/**
 * The rentals feed as JSON. Mirror of api/listings; see the note there.
 */
import { NextResponse } from "next/server";
import { getRentals } from "@/app/lib/rentals-queries";
import { paramsFromSearch, parseRentalFilters } from "@/app/lib/filters";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = paramsFromSearch(new URL(request.url).searchParams);
  try {
    const result = await getRentals(parseRentalFilters(params));
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[api/rentals]", err);
    return NextResponse.json(
      { error: "Could not load rentals" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
