export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { getListingById } from "@/app/lib/queries";
import {
  formatPrice,
  formatKm,
  formatDate,
  capitalize,
} from "@/app/lib/format";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ListingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const listing = await getListingById(id);

  if (!listing) notFound();

  const photos = (listing.photos as string[] | null) ?? [];

  return (
    <div>
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
      >
        &larr; Back to listings
      </Link>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {photos.length > 0 && (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {photos.slice(0, 6).map((url, i) => (
              <div key={i} className="relative aspect-[4/3] bg-gray-100">
                <img
                  src={url}
                  alt={`Photo ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">
                {listing.year} {listing.make} {listing.model}
              </h1>
              {listing.variant && (
                <p className="mt-1 text-gray-500">{listing.variant}</p>
              )}
            </div>
            <p className="text-3xl font-bold text-green-700">
              ₹{formatPrice(listing.price)}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Detail label="Km Driven" value={formatKm(listing.kmDriven)} />
            <Detail
              label="Fuel Type"
              value={capitalize(listing.fuelType)}
            />
            <Detail
              label="Transmission"
              value={capitalize(listing.transmission)}
            />
            <Detail
              label="Body Type"
              value={capitalize(listing.bodyType)}
            />
            <Detail
              label="Owners"
              value={
                listing.ownerCount != null
                  ? `${listing.ownerCount}`
                  : "—"
              }
            />
            <Detail label="Color" value={capitalize(listing.color)} />
            <Detail label="City" value={listing.city} />
            <Detail
              label="Location"
              value={listing.location ?? "—"}
            />
            <Detail
              label="Listed"
              value={formatDate(listing.listedAt)}
            />
            <Detail
              label="Scraped"
              value={formatDate(listing.scrapedAt)}
            />
            <Detail label="Source" value={listing.sourcePlatform} />
          </div>

          {listing.description && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">
                Description
              </h2>
              <p className="whitespace-pre-wrap text-sm text-gray-700">
                {listing.description}
              </p>
            </div>
          )}

          <div className="mt-6 border-t pt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">
              Seller Info
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Detail
                label="Name"
                value={listing.sellerName ?? "—"}
              />
              <Detail
                label="Phone"
                value={listing.sellerPhone ?? "—"}
              />
              <Detail
                label="Type"
                value={capitalize(listing.sellerType)}
              />
            </div>
          </div>

          <div className="mt-6 border-t pt-4">
            <a
              href={listing.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              View original listing &rarr;
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}
