import Link from "next/link";
import { formatPrice, formatKm, capitalize } from "@/app/lib/format";

interface Listing {
  id: string;
  make: string;
  model: string;
  variant: string | null;
  year: number;
  price: string;
  kmDriven: number | null;
  fuelType: string | null;
  transmission: string | null;
  city: string;
  sourcePlatform: string;
  photos: string[] | null;
}

export function ListingCard({ listing }: { listing: Listing }) {
  const photo =
    listing.photos && listing.photos.length > 0 ? listing.photos[0] : null;

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-[4/3] bg-gray-100">
        {photo ? (
          <img
            src={photo}
            alt={`${listing.make} ${listing.model}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            No Photo
          </div>
        )}
        <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          {listing.sourcePlatform}
        </span>
      </div>

      <div className="p-3">
        <h3 className="truncate text-sm font-semibold group-hover:text-blue-600">
          {listing.year} {listing.make} {listing.model}
        </h3>
        {listing.variant && (
          <p className="truncate text-xs text-gray-500">{listing.variant}</p>
        )}

        <p className="mt-1 text-lg font-bold text-green-700">
          ₹{formatPrice(listing.price)}
        </p>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>{formatKm(listing.kmDriven)}</span>
          <span>{capitalize(listing.fuelType)}</span>
          <span>{capitalize(listing.transmission)}</span>
        </div>

        <p className="mt-1 text-xs text-gray-400">{listing.city}</p>
      </div>
    </Link>
  );
}
