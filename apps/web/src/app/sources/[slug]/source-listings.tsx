"use client";

/**
 * A source's inventory, rendered with the same cards as the feeds.
 *
 * A client component only so the cards can open the preview dialog instead of
 * navigating — browsing a broker's twenty homes is the same comparison task as
 * browsing the feed, and it should behave the same way.
 */
import { ListingCard, type CardListing } from "@/app/components/listing-card";
import { RentalCard, type RentalCardListing } from "@/app/components/rental-card";
import { ListingPreview } from "@/app/components/listing-preview";
import { usePreview } from "@/app/lib/use-preview";

export function SourceListings({
  cars,
  rentals,
}: {
  cars: CardListing[];
  rentals: RentalCardListing[];
}) {
  const { open } = usePreview();
  const isRentals = rentals.length > 0;
  const count = isRentals ? rentals.length : cars.length;

  if (count === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center">
        <p className="font-display text-base font-semibold text-ink-200">
          Nothing listed right now
        </p>
        <p className="max-w-sm text-sm text-ink-500">
          Their older posts have either been taken or have aged out of the index.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {isRentals
          ? rentals.map((listing, i) => (
              <RentalCard
                key={listing.id}
                listing={listing}
                priority={i < 3}
                onPreview={open}
              />
            ))
          : cars.map((listing, i) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                priority={i < 3}
                onPreview={open}
              />
            ))}
      </div>
      <ListingPreview />
    </>
  );
}
