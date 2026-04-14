export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Droplet,
  Fuel,
  Gauge,
  ImageOff,
  MapPin,
  Palette,
  Phone,
  Settings2,
  User,
  Users,
} from "lucide-react";
import { getListingById } from "@/app/lib/queries";
import {
  formatPrice,
  formatKm,
  formatDate,
  capitalize,
} from "@/app/lib/format";
import { SourceBadge } from "@/app/components/source-badge";
import { BookmarkButton } from "@/app/components/bookmark-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) return { title: "Listing not found" };

  const title = `${listing.year} ${listing.make} ${listing.model}${listing.variant ? " " + listing.variant : ""}`;
  const priceText =
    listing.price != null
      ? `₹${formatPrice(listing.price)}`
      : "Price on request";
  const descriptionParts = [
    priceText,
    listing.kmDriven != null ? formatKm(listing.kmDriven) : null,
    listing.fuelType ? capitalize(listing.fuelType) : null,
    listing.transmission ? capitalize(listing.transmission) : null,
    listing.city,
  ].filter(Boolean);

  const media = (listing.media as Array<{ url: string; type: string; posterUrl?: string | null }> | null) ?? [];
  const heroImage =
    media.find((m) => m.type === "image")?.url ??
    media[0]?.posterUrl ??
    undefined;

  return {
    title,
    description: descriptionParts.join(" · "),
    openGraph: {
      title,
      description: descriptionParts.join(" · "),
      type: "article",
      images: heroImage ? [{ url: heroImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: descriptionParts.join(" · "),
      images: heroImage ? [heroImage] : undefined,
    },
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ListingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const listing = await getListingById(id);

  if (!listing) notFound();

  type MediaItem = {
    url: string;
    type: "image" | "video";
    mimeType?: string | null;
    posterUrl?: string | null;
  };
  const media = ((listing.media as MediaItem[] | null) ?? []).filter(
    (m) => m && m.url && (m.type === "image" || m.type === "video"),
  );
  const hero = media[0];
  const thumbnails = media.slice(1, 5);
  const isSold = listing.saleStatus === "sold";

  return (
    <div className="animate-fade-in-up">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to listings
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SourceBadge platform={listing.sourcePlatform} size="md" />
        <span className="chip">
          <Calendar className="h-3 w-3" />
          Listed {formatDate(listing.listedAt)}
        </span>
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
            Asking Price
          </p>
          <p className="font-display text-3xl font-bold text-accent">
            ₹{formatPrice(listing.price)}
          </p>
        </div>
      </div>

      <div className="mb-8 grid gap-2 sm:grid-cols-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/5 bg-ink-900 sm:col-span-2 sm:aspect-auto sm:row-span-2">
          {hero ? (
            <MediaFrame item={hero} primary />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-500">
              <ImageOff className="h-10 w-10" strokeWidth={1.3} />
              <span className="text-sm">No preview</span>
            </div>
          )}
        </div>
        {thumbnails.map((item, i) => (
          <div
            key={i}
            className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/5 bg-ink-900"
          >
            <MediaFrame item={item} />
          </div>
        ))}
        {Array.from({ length: Math.max(0, 4 - thumbnails.length) }).map(
          (_, i) => (
            <div
              key={`empty-${i}`}
              className="relative hidden aspect-[4/3] overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] sm:block"
            />
          ),
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="surface rounded-2xl p-6">
            <h2 className="mb-5 font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink-200">
              Specifications
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              <Detail
                icon={Gauge}
                label="Km Driven"
                value={formatKm(listing.kmDriven)}
              />
              <Detail
                icon={Fuel}
                label="Fuel"
                value={capitalize(listing.fuelType) || "—"}
              />
              <Detail
                icon={Settings2}
                label="Transmission"
                value={capitalize(listing.transmission) || "—"}
              />
              <Detail
                icon={Droplet}
                label="Body type"
                value={capitalize(listing.bodyType) || "—"}
              />
              <Detail
                icon={Users}
                label="Owners"
                value={listing.ownerCount != null ? `${listing.ownerCount}` : "—"}
              />
              <Detail
                icon={Palette}
                label="Color"
                value={capitalize(listing.color) || "—"}
              />
              <Detail
                icon={MapPin}
                label="Location"
                value={listing.location ?? "—"}
              />
              <Detail
                icon={Calendar}
                label="Year"
                value={String(listing.year)}
              />
              <Detail
                icon={Calendar}
                label="Scraped"
                value={formatDate(listing.scrapedAt)}
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
        </div>

        <aside className="space-y-4">
          <section className="surface rounded-2xl p-6">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink-200">
              Seller
            </h2>
            <div className="space-y-3">
              <Row
                icon={User}
                label="Name"
                value={listing.sellerName ?? "—"}
              />
              <Row
                icon={Phone}
                label="Phone"
                value={listing.sellerPhone ?? "—"}
              />
              <Row
                icon={Users}
                label="Type"
                value={capitalize(listing.sellerType) || "—"}
              />
            </div>
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
        </aside>
      </div>
    </div>
  );
}

function MediaFrame({
  item,
  primary = false,
}: {
  item: {
    url: string;
    type: "image" | "video";
    mimeType?: string | null;
    posterUrl?: string | null;
  };
  primary?: boolean;
}) {
  if (item.type === "video") {
    return (
      <video
        src={item.url}
        poster={item.posterUrl ?? undefined}
        controls={primary}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={item.url}
      alt=""
      className={`h-full w-full object-cover ${primary ? "" : "transition duration-500 hover:scale-105"}`}
    />
  );
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
        <dd className="mt-0.5 truncate text-sm font-semibold text-ink-100">
          {value}
        </dd>
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
