import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BedDouble,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Layers,
  MapPin,
  Maximize2,
  MessageCircle,
  ParkingCircle,
  Phone,
  Sofa,
  Users,
  Wallet,
} from "lucide-react";
import { getRentalById, getSimilarRentals } from "@/app/lib/rentals-queries";
import { orderedGallery, pickHeroImage, type MediaItem } from "@/app/lib/media";
import { formatDate, relativeAge, daysBetween } from "@/app/lib/format";
import {
  bhkLabel,
  depositMonths,
  formatLumpSum,
  formatRent,
  rentalLabel,
  rentalTitle,
} from "@/app/lib/rental-format";
import { STALE_AFTER_DAYS } from "@preowned-cars/shared";
import { Gallery } from "@/app/components/gallery";
import { AgeChip } from "@/app/components/age-chip";
import { SourceBadge } from "@/app/components/source-badge";
import { BookmarkButton } from "@/app/components/bookmark-button";
import { ReportListingModal } from "@/app/components/report-listing-modal";
import { RentalCard } from "@/app/components/rental-card";

export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await getRentalById(id);
  if (!listing) return { title: "Listing not found" };

  const title = rentalTitle(listing);
  const rent = formatRent(listing.rent);
  const description = [
    rent ? `₹${rent}/month` : "Rent on request",
    listing.carpetAreaSqft ? `${listing.carpetAreaSqft} sqft` : null,
    listing.furnishing ? rentalLabel(listing.furnishing) : null,
    listing.city,
  ]
    .filter(Boolean)
    .join(" · ");

  const hero = pickHeroImage(listing.media as MediaItem[] | null, listing.heroMediaUrl);
  return {
    title,
    description,
    alternates: { canonical: `/rent/${id}` },
    openGraph: {
      title,
      description,
      type: "article",
      images: hero ? [{ url: hero.url }] : undefined,
    },
  };
}

export default async function RentalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getRentalById(id);
  if (!listing) notFound();

  const media = orderedGallery(listing.media as MediaItem[] | null, listing.heroMediaUrl);
  const title = rentalTitle(listing);
  const rent = formatRent(listing.rent);
  const deposit = formatLumpSum(listing.deposit);
  const months = depositMonths(listing.deposit, listing.rent);
  const listedDate = listing.listedAt ?? listing.firstSeenAt;
  const isStale = daysBetween(listing.lastSeenAt) > STALE_AFTER_DAYS;
  const isTaken = listing.saleStatus === "sold";
  const phone = listing.sellerPhone;

  const similar = await getSimilarRentals({
    id: listing.id,
    localityId: listing.localityId,
    bhk: listing.bhk,
  });

  return (
    <div className="animate-fade-in-up">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(listing, media, title)) }}
      />

      <Link
        href="/rent"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to rentals
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SourceBadge platform={listing.sourcePlatform} size="md" />
        <AgeChip date={listedDate} />
        <span className="chip">
          <MapPin className="h-3 w-3" />
          {listing.localityName ?? listing.city}
        </span>
        {isTaken && (
          <span className="inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-200">
            Taken
          </span>
        )}
        <BookmarkButton listingId={listing.id} size="md" />
      </div>

      {/* Rentals move fast, so an unconfirmed listing is more misleading here
          than it is for cars. The threshold is the same; the wording is blunter. */}
      {isStale && !isTaken && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div className="text-sm">
            <p className="font-semibold text-amber-100">
              Not confirmed in {relativeAge(listing.lastSeenAt)?.replace(" ago", "")}.
            </p>
            <p className="mt-0.5 text-amber-200/70">
              Rentals go quickly. Message the broker before planning a visit.
            </p>
          </div>
        </div>
      )}

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-500">
            {rentalLabel(listing.propertyType)} · {listing.city}
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            {title}
          </h1>
          {listing.locationText && listing.locationText !== listing.localityName && (
            <p className="mt-2 text-base text-ink-400">{listing.locationText}</p>
          )}
        </div>
        <div className="rounded-2xl border border-accent/20 bg-accent/5 px-5 py-3 shadow-glow">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent/70">
            Monthly rent
          </p>
          <p className="font-display text-3xl font-bold text-accent">
            {rent ? `₹${rent}` : "On request"}
          </p>
          {deposit && (
            <p className="mt-0.5 font-mono text-[11px] text-ink-400">
              + ₹{deposit} deposit{months ? ` (${months})` : ""}
            </p>
          )}
        </div>
      </div>

      <div className="mb-8">
        <Gallery media={media} alt={`${title}, ${rentalLabel(listing.furnishing).toLowerCase()}`} />
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_280px] lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="surface rounded-2xl p-6">
            <h2 className="mb-5 font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink-200">
              The home
            </h2>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5 md:grid-cols-3">
              <Detail icon={BedDouble} label="Layout" value={bhkLabel(listing)} />
              <Detail
                icon={Maximize2}
                label="Carpet area"
                value={listing.carpetAreaSqft ? `${listing.carpetAreaSqft} sqft` : "—"}
              />
              <Detail icon={Sofa} label="Furnishing" value={rentalLabel(listing.furnishing)} />
              <Detail
                icon={Layers}
                label="Floor"
                value={
                  listing.floor != null
                    ? `${listing.floor}${listing.totalFloors ? ` of ${listing.totalFloors}` : ""}`
                    : "—"
                }
              />
              <Detail icon={Users} label="Tenants" value={rentalLabel(listing.tenantPreference)} />
              <Detail icon={ParkingCircle} label="Parking" value={rentalLabel(listing.parking)} />
              <Detail
                icon={Wallet}
                label="Maintenance"
                value={
                  listing.maintenanceIncluded
                    ? "Included"
                    : listing.maintenance
                      ? `₹${formatLumpSum(listing.maintenance)}/mo`
                      : "—"
                }
              />
              <Detail
                icon={CalendarCheck}
                label="Available"
                value={listing.availableFrom ? formatDate(listing.availableFrom) : "Immediate"}
              />
              <Detail
                icon={CheckCircle2}
                label="Last confirmed"
                value={formatDate(listing.lastSeenAt)}
              />
            </dl>

            {listing.amenities.length > 0 && (
              <div className="mt-5 border-t border-white/5 pt-4">
                <p className="field-label">Amenities</p>
                <div className="flex flex-wrap gap-1.5">
                  {listing.amenities.map((a) => (
                    <span
                      key={a}
                      className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] capitalize text-ink-300"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {listing.description && (
            <section className="surface rounded-2xl p-6">
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink-200">
                From the listing
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-300">
                {listing.description}
              </p>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="surface rounded-2xl p-6">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink-200">
              Broker
            </h2>
            <div className="space-y-3">
              <Row icon={Building2} label="Name" value={listing.orgName ?? "—"} />
              <Row icon={Phone} label="Phone" value={phone ?? "—"} />
            </div>
            {phone && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a
                  href={`tel:+91${phone}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-ink-100 transition hover:bg-white/[0.07]"
                >
                  <Phone className="h-3.5 w-3.5" />
                  Call
                </a>
                <a
                  href={`https://wa.me/91${phone}?text=${encodeURIComponent(
                    `Hi, is the ${title} still available?`,
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
              <p className="font-display text-base font-bold">Open on {listing.sourcePlatform}</p>
            </div>
            <ArrowUpRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} />
          </a>

          <ReportListingModal listingId={listing.id} />
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-5 font-display text-xl font-bold tracking-tight text-ink-50">
            Similar homes nearby
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {similar.slice(0, 3).map((item) => (
              <RentalCard key={item.id} listing={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function buildJsonLd(
  listing: NonNullable<Awaited<ReturnType<typeof getRentalById>>>,
  media: MediaItem[],
  title: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Apartment",
    name: title,
    ...(listing.description ? { description: listing.description.slice(0, 400) } : {}),
    ...(listing.bhk != null ? { numberOfRooms: listing.bhk } : {}),
    ...(listing.carpetAreaSqft
      ? {
          floorSize: {
            "@type": "QuantitativeValue",
            value: listing.carpetAreaSqft,
            unitCode: "FTK",
          },
        }
      : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: listing.localityName ?? listing.locationText ?? listing.city,
      addressRegion: listing.city,
      addressCountry: "IN",
    },
    image: media.filter((m) => m.type === "image").map((m) => m.url).slice(0, 6),
    ...(listing.rent
      ? {
          // schema.org expresses recurring rent as a UnitPriceSpecification with
          // a billing period, not a flat price.
          offers: {
            "@type": "Offer",
            priceCurrency: "INR",
            availability:
              listing.saleStatus === "sold"
                ? "https://schema.org/SoldOut"
                : "https://schema.org/InStock",
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: listing.rent,
              priceCurrency: "INR",
              unitCode: "MON",
              billingIncrement: 1,
            },
          },
        }
      : {}),
  };
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Sofa;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/5 bg-white/[0.03] text-ink-300">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">{label}</dt>
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
  icon: typeof Sofa;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-ink-500">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]">{label}</span>
      </span>
      <span className="truncate font-medium text-ink-100">{value}</span>
    </div>
  );
}
