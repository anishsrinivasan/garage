import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getRentalById } from "@/app/lib/rentals-queries";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Droplet,
  Fuel,
  Gauge,
  MapPin,
  MessageCircle,
  Palette,
  Phone,
  Settings2,
  Store,
  Users,
} from "lucide-react";
import {
  getListingById,
  getClusterSiblings,
  getSimilarListings,
} from "@/app/lib/queries";
import {
  formatPrice,
  exactPrice,
  formatKm,
  formatDate,
  capitalize,
  enumLabel,
  imageAlt,
  relativeAge,
  daysBetween,
} from "@/app/lib/format";
import { orderedGallery, pickHeroImage, type MediaItem } from "@/app/lib/media";
import { STALE_AFTER_DAYS } from "@classifieds/shared";
import { SourceBadge } from "@/app/components/source-badge";
import { BookmarkButton } from "@/app/components/bookmark-button";
import { ReportListingModal } from "@/app/components/report-listing-modal";
import { Gallery } from "@/app/components/gallery";
import { ListingCard } from "@/app/components/listing-card";
import { AgeChip } from "@/app/components/age-chip";

export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) return { title: "Listing not found" };

  const title = `${listing.year} ${listing.make} ${listing.model}${listing.variant ? " " + listing.variant : ""}`;
  const price = formatPrice(listing.price);
  const descriptionParts = [
    price ? `₹${price}` : "Price on request",
    listing.kmDriven != null ? formatKm(listing.kmDriven) : null,
    listing.fuelType ? enumLabel(listing.fuelType) : null,
    listing.transmission ? enumLabel(listing.transmission) : null,
    listing.city,
  ].filter(Boolean);

  const hero = pickHeroImage(listing.media as MediaItem[] | null, listing.heroMediaUrl);

  return {
    title,
    description: descriptionParts.join(" · "),
    alternates: { canonical: `/listings/${id}` },
    openGraph: {
      title,
      description: descriptionParts.join(" · "),
      type: "article",
      images: hero ? [{ url: hero.url }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: descriptionParts.join(" · "),
      images: hero ? [hero.url] : undefined,
    },
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ListingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) {
    // The id may be a real listing in another vertical — a bookmark saved before
    // the card linked to the right place, or a hand-edited URL. Send it to the
    // surface that can actually render it instead of a dead 404.
    if (await getRentalById(id)) redirect(`/rent/${id}`);
    notFound();
  }

  const media = orderedGallery(
    listing.media as MediaItem[] | null,
    listing.heroMediaUrl,
  );
  const isSold = listing.saleStatus === "sold";
  const price = formatPrice(listing.price);
  const listedDate = listing.listedAt ?? listing.firstSeenAt;
  const daysSinceConfirmed = daysBetween(listing.lastSeenAt);
  const isStale = daysSinceConfirmed > STALE_AFTER_DAYS;
  const alt = imageAlt(listing);

  const [siblings, similar] = await Promise.all([
    getClusterSiblings(listing.id, listing.dedupClusterId),
    getSimilarListings(listing),
  ]);

  const whatsappNumber = listing.sellerPhone ?? listing.garagePhone;

  return (
    <div className="animate-fade-in-up">
      {/* schema.org Vehicle + Offer. The site has an SEO-shaped metadata setup
          but shipped no structured data, so listings couldn't produce rich
          results. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildVehicleJsonLd(listing, media)),
        }}
      />

      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to listings
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SourceBadge platform={listing.sourcePlatform} size="md" />
        <AgeChip date={listedDate} />
        <span className="chip">
          <MapPin className="h-3 w-3" />
          {listing.city}
        </span>
        {isSold && (
          <span className="inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-200">
            Sold
          </span>
        )}
        <BookmarkButton listingId={listing.id} size="md" />
      </div>

      {/* A listing we can no longer re-confirm is the single most misleading
          thing this site can show. Say so explicitly rather than letting it
          look as current as everything else. */}
      {isStale && !isSold && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div className="text-sm">
            <p className="font-semibold text-amber-100">
              We haven&apos;t been able to confirm this listing in{" "}
              {relativeAge(listing.lastSeenAt)?.replace(" ago", "")}.
            </p>
            <p className="mt-0.5 text-amber-200/70">
              It may already be sold. Check with the dealer before travelling.
            </p>
          </div>
        </div>
      )}

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-500">
            {listing.year} · {listing.sourcePlatform}
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            {listing.make} {listing.model}
          </h1>
          {listing.variant && (
            <p className="mt-2 text-base text-ink-400">{listing.variant}</p>
          )}
        </div>
        <div className="rounded-2xl border border-accent/20 bg-accent/5 px-5 py-3 shadow-glow">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent/70">
            {price ? "Asking price" : "Price"}
          </p>
          <p className="font-display text-3xl font-bold text-accent">
            {price ? `₹${price}` : "On request"}
          </p>
        </div>
      </div>

      <div className="mb-8">
        <Gallery media={media} alt={alt} />
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_280px] lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="surface rounded-2xl p-6">
            <h2 className="mb-5 font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink-200">
              Specifications
            </h2>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5 md:grid-cols-3">
              <Detail icon={Gauge} label="Km driven" value={formatKm(listing.kmDriven)} />
              <Detail icon={Fuel} label="Fuel" value={enumLabel(listing.fuelType)} />
              <Detail
                icon={Settings2}
                label="Transmission"
                value={enumLabel(listing.transmission)}
              />
              <Detail icon={Droplet} label="Body type" value={enumLabel(listing.bodyType)} />
              <Detail
                icon={Users}
                label="Owners"
                value={listing.ownerCount != null ? String(listing.ownerCount) : "—"}
              />
              <Detail icon={Palette} label="Colour" value={capitalize(listing.color)} />
              <Detail icon={Calendar} label="Year" value={String(listing.year)} />
              {/* "Scraped" was internal jargon on a public page. These two are
                  what a buyer actually wants: when it went up, and how sure we
                  are it's still available. */}
              <Detail icon={Calendar} label="Listed" value={formatDate(listedDate)} />
              <Detail
                icon={CheckCircle2}
                label="Last confirmed"
                value={formatDate(listing.lastSeenAt)}
              />
            </dl>
          </section>

          {listing.description && (
            <section className="surface rounded-2xl p-6">
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink-200">
                Description
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-300">
                {listing.description}
              </p>
            </section>
          )}

          {/* Reposts of the same car, collapsed out of the feed by the deduper
              but still worth showing here — a second post often has better
              photos or a revised price. */}
          {siblings.length > 0 && (
            <section className="surface rounded-2xl p-6">
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink-200">
                Also posted
              </h2>
              <ul className="space-y-2">
                {siblings.map((sibling) => (
                  <li key={sibling.id}>
                    <Link
                      href={`/listings/${sibling.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2 text-sm transition hover:border-white/15 hover:bg-white/[0.03]"
                    >
                      <span className="text-ink-300">
                        {sibling.sourcePlatform} ·{" "}
                        {formatDate(sibling.listedAt ?? sibling.firstSeenAt)}
                      </span>
                      <span className="font-mono text-xs text-accent">
                        {formatPrice(sibling.price)
                          ? `₹${formatPrice(sibling.price)}`
                          : "On request"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="surface rounded-2xl p-6">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink-200">
              Seller
            </h2>
            <div className="space-y-3">
              {listing.garageSlug ? (
                <Link
                  href={`/garages/${listing.garageSlug}`}
                  className="flex items-center justify-between gap-3 text-sm transition hover:text-accent"
                >
                  <span className="flex items-center gap-2 text-ink-500">
                    <Store className="h-3.5 w-3.5" strokeWidth={1.8} />
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                      Garage
                    </span>
                  </span>
                  <span className="truncate font-medium text-ink-100">
                    {listing.garageName ?? listing.sellerName ?? "—"}
                  </span>
                </Link>
              ) : (
                <Row icon={Store} label="Seller" value={listing.sellerName ?? "—"} />
              )}
              <Row icon={Phone} label="Phone" value={whatsappNumber ?? "—"} />
              <Row icon={Users} label="Type" value={capitalize(listing.sellerType)} />
            </div>

            {/* Most Indian dealers respond on WhatsApp, not calls — 271 of the
                319 Instagram listings carry a mobile number. */}
            {whatsappNumber && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a
                  href={`tel:+91${whatsappNumber}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-ink-100 transition hover:bg-white/[0.07]"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Call
                </a>
                <a
                  href={`https://wa.me/91${whatsappNumber}?text=${encodeURIComponent(
                    `Hi, is the ${listing.year} ${listing.make} ${listing.model} still available?`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              </div>
            )}
          </section>

          <a
            href={listing.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between rounded-2xl border border-accent/20 bg-accent-gradient p-5 text-ink-950 transition hover:-translate-y-0.5 hover:shadow-glow"
          >
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
                View original
              </p>
              <p className="font-display text-base font-bold">
                Open on {listing.sourcePlatform}
              </p>
            </div>
            <ArrowUpRight
              className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2.5}
            />
          </a>

          <ReportListingModal listingId={listing.id} />
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-5 font-display text-xl font-bold tracking-tight text-ink-50">
            Similar cars
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {similar.slice(0, 3).map((item) => (
              <ListingCard key={item.id} listing={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function buildVehicleJsonLd(
  listing: Awaited<ReturnType<typeof getListingById>> & object,
  media: MediaItem[],
) {
  const price = exactPrice(listing.price);
  return {
    "@context": "https://schema.org",
    "@type": "Car",
    name: `${listing.year} ${listing.make} ${listing.model}${listing.variant ? ` ${listing.variant}` : ""}`,
    brand: { "@type": "Brand", name: listing.make },
    model: listing.model,
    vehicleModelDate: String(listing.year),
    ...(listing.color ? { color: listing.color } : {}),
    ...(listing.bodyType ? { bodyType: listing.bodyType } : {}),
    ...(listing.fuelType ? { fuelType: listing.fuelType } : {}),
    ...(listing.transmission ? { vehicleTransmission: listing.transmission } : {}),
    ...(listing.kmDriven != null
      ? {
          mileageFromOdometer: {
            "@type": "QuantitativeValue",
            value: listing.kmDriven,
            unitCode: "KMT",
          },
        }
      : {}),
    ...(listing.ownerCount != null
      ? { numberOfPreviousOwners: listing.ownerCount }
      : {}),
    image: media.filter((m) => m.type === "image").map((m) => m.url).slice(0, 6),
    ...(listing.description ? { description: listing.description.slice(0, 400) } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      ...(price ? { price } : {}),
      availability:
        listing.saleStatus === "sold"
          ? "https://schema.org/SoldOut"
          : "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
      ...(listing.garageName
        ? { seller: { "@type": "AutoDealer", name: listing.garageName } }
        : {}),
      areaServed: listing.city,
    },
  };
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/5 bg-white/[0.03] text-ink-300">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">
          {label}
        </dt>
        <dd className="mt-0.5 truncate text-sm font-semibold text-ink-100">{value}</dd>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-ink-500">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
          {label}
        </span>
      </span>
      <span className="truncate font-medium text-ink-100">{value}</span>
    </div>
  );
}
