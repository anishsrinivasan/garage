import Link from "next/link";
import Image from "next/image";
import { Fuel, Gauge, Settings2, MapPin, ImageOff, Play, Images } from "lucide-react";
import { formatPrice, formatKm, capitalize, imageAlt } from "@/app/lib/format";
import { pickHeroImage, hasVideo, imageCount, type MediaItem } from "@/app/lib/media";
import { SourceBadge } from "./source-badge";
import { BookmarkButton } from "./bookmark-button";
import { AgeChip } from "./age-chip";

export interface CardListing {
  id: string;
  make: string;
  model: string;
  variant: string | null;
  year: number;
  price: string | null;
  listingStatus?: string | null;
  saleStatus?: string | null;
  kmDriven: number | null;
  fuelType: string | null;
  transmission: string | null;
  city: string;
  sourcePlatform: string;
  media: MediaItem[] | null;
  heroMediaUrl?: string | null;
  listedAt?: Date | string | null;
  firstSeenAt?: Date | string | null;
  garageName?: string | null;
  garageSlug?: string | null;
}

/**
 * `sizes` matters here: the grid is 1 column on mobile, 2 at `sm`, 3 at `xl`
 * inside a 7xl container. Without it Next ships the widest candidate to every
 * viewport, which on 9:16 Instagram originals meant ~1 MB per card.
 */
const CARD_IMAGE_SIZES =
  "(min-width: 1280px) 400px, (min-width: 640px) 45vw, 92vw";

export function ListingCard({
  listing,
  priority = false,
}: {
  listing: CardListing;
  priority?: boolean;
}) {
  const hero = pickHeroImage(listing.media, listing.heroMediaUrl);
  const photos = imageCount(listing.media);
  const isReel = hasVideo(listing.media);
  const isSold = listing.saleStatus === "sold";
  const price = formatPrice(listing.price);
  // listedAt is populated for every row post-migration, but fall back anyway so
  // a freshly-inserted row without one still shows an age.
  const dateForAge = listing.listedAt ?? listing.firstSeenAt ?? null;

  return (
    <Link
      href={`/listings/${listing.id}`}
      className={`group relative block overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-850/40 shadow-card backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.14] hover:shadow-card-hover ${
        isSold ? "opacity-70" : ""
      }`}
    >
      <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-accent/0 via-accent/0 to-accent/0 opacity-0 transition-opacity duration-500 group-hover:from-accent/20 group-hover:via-pink-500/5 group-hover:to-electric/20 group-hover:opacity-100" />

      {/* 3:2 rather than 4:3 — Instagram media is 9:16, and the taller the card
          frame the less of the car survives the centre crop. */}
      <div className="relative aspect-[3/2] overflow-hidden bg-ink-900">
        {hero ? (
          <>
            <Image
              src={hero.url}
              alt={imageAlt(listing)}
              fill
              sizes={CARD_IMAGE_SIZES}
              priority={priority}
              // Cars sit high in a 9:16 frame; centring the crop cuts the roof.
              className="object-cover object-[center_38%] transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/10 to-ink-950/20" />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-500">
            <ImageOff className="h-8 w-8" strokeWidth={1.5} />
            <span className="text-xs">No preview</span>
          </div>
        )}

        {/* Always visible on touch: the bookmark used to be opacity-0 until
            group-hover, which made it unreachable on a phone. */}
        <div className="absolute right-3 top-3 z-10 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 md:[&:has([data-bookmarked])]:opacity-100">
          <BookmarkButton listingId={listing.id} />
        </div>

        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <SourceBadge platform={listing.sourcePlatform} />
          <AgeChip date={dateForAge} showIcon={false} />
          {isSold && (
            <span className="inline-flex items-center rounded-md bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-200 ring-1 ring-inset ring-rose-500/30 backdrop-blur-md">
              Sold
            </span>
          )}
        </div>

        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-300/80">
              {listing.year}
            </p>
            <h3 className="truncate font-display text-[15px] font-bold leading-tight text-ink-50">
              {listing.make} {listing.model}
            </h3>
          </div>
          <div
            className={`shrink-0 rounded-lg border px-2.5 py-1 backdrop-blur-md ${
              price
                ? "border-white/10 bg-ink-950/70"
                : "border-electric/25 bg-ink-950/70"
            }`}
          >
            {price ? (
              <p className="whitespace-nowrap font-mono text-[13px] font-bold text-accent">
                ₹{price}
              </p>
            ) : (
              /* 32% of listings have no price. An empty chip read as broken;
                 this reads as a deliberate state. */
              <p className="whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-wider text-electric">
                Ask price
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="relative p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-ink-400">
            {listing.variant ?? "—"}
          </p>
          <div className="flex shrink-0 items-center gap-1.5 text-ink-500">
            {photos > 1 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium">
                <Images className="h-3 w-3" strokeWidth={2} />
                {photos}
              </span>
            )}
            {isReel && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium">
                <Play className="h-2.5 w-2.5 fill-current" strokeWidth={2.5} />
                Reel
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
          <Spec icon={Gauge} value={formatKm(listing.kmDriven)} />
          <Spec icon={Fuel} value={capitalize(listing.fuelType)} />
          <Spec icon={Settings2} value={capitalize(listing.transmission)} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-ink-500">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            {listing.city}
          </span>
          {/* Who is selling was previously invisible until you opened the
              listing, which made the grid feel anonymous. */}
          {listing.garageName && (
            <span className="truncate font-medium text-ink-400">
              {listing.garageName}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function Spec({
  icon: Icon,
  value,
}: {
  icon: typeof Gauge;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-ink-300">
      <Icon className="h-3.5 w-3.5 shrink-0 text-ink-500" strokeWidth={1.75} />
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

/** Grid placeholder shown while the results stream in. */
export function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-850/40">
      <div className="aspect-[3/2] animate-pulse bg-white/[0.04]" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.05]" />
        <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
          <div className="h-3 animate-pulse rounded bg-white/[0.04]" />
          <div className="h-3 animate-pulse rounded bg-white/[0.04]" />
          <div className="h-3 animate-pulse rounded bg-white/[0.04]" />
        </div>
        <div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.04]" />
      </div>
    </div>
  );
}
