/**
 * One listing as JSON, for the preview dialog.
 *
 * Vertical-agnostic on purpose: the caller has an id and nothing else. A card
 * in the saved list does not know whether it is a car or a flat, and neither
 * does a pasted `?preview=` link, so this route resolves that here rather than
 * making every caller guess and retry.
 */
import { NextResponse } from "next/server";
import { getListingById } from "@/app/lib/queries";
import { getRentalById } from "@/app/lib/rentals-queries";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const car = await getListingById(id);
    if (car) return NextResponse.json({ vertical: "cars", listing: car }, { headers: noStore });

    const rental = await getRentalById(id);
    if (rental)
      return NextResponse.json({ vertical: "rentals", listing: rental }, { headers: noStore });

    return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  } catch (err) {
    console.error("[api/listing]", err);
    return NextResponse.json(
      { error: "Could not load listing" },
      { status: 502, headers: noStore },
    );
  }
}
