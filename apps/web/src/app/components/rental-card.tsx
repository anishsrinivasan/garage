"use client";

import Link from "next/link";
import Image from "next/image";
import { BedDouble, ImageOff, MapPin, Maximize2, Sofa, Wallet } from "lucide-react";
import { pickHeroImage, imageCount, type MediaItem } from "@/app/lib/media";
import {
  bhkLabel,
  formatRent,
  formatLumpSum,
  rentalLabel,
  depositMonths,
} from "@/app/lib/rental-format";
import { AgeChip } from "./age-chip";
import { SourceBadge } from "./source-badge";
import { BookmarkButton } from "./bookmark-button";

export interface RentalCardListing {
  id: string;
  bhk: number | null;
  propertyType: string | null;
  carpetAreaSqft: number | null;
  rent: number | null;
  deposit: number | null;
  furnishing: string | null;
  city: string;
  locationText: string | null;
  localityName: string | null;
  sourcePlatform: string;
  saleStatus: string | null;
  media: MediaItem[] | null;
  heroMediaUrl?: string | null;
  listedAt?: Date | string | null;
  firstSeenAt?: Date | string | null;
  orgName?: string | null;
}

const CARD_IMAGE_SIZES = "(min-width: 1280px) 400px, (min-width: 640px) 45vw, 92vw";

export function RentalCard({
  listing,
  priority = false,
}: {
  listing: RentalCardListing;
  priority?: boolean;
}) {
  const hero = pickHeroImage(listing.media, listing.heroMediaUrl);
  const photos = imageCount(listing.media);
  const rent = formatRent(listing.rent);
  const deposit = formatLumpSum(listing.deposit);
  const months = depositMonths(listing.deposit, listing.rent);
  const isTaken = listing.saleStatus === "sold";
  const where = listing.localityName ?? listing.locationText?.trim() ?? listing.city;
  const dateForAge = listing.listedAt ?? listing.firstSeenAt ?? null;

  return (
    <Link
      href={`/rent/${listing.id}`}
      className={`group relative block overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-850/40 shadow-card backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.14] hover:shadow-card-hover ${
        isTaken ? "opacity-70" : ""
      }`}
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-ink-900">
        {hero ? (
          <>
            <Image
              src={hero.url}
              alt={`${bhkLabel(listing)} for rent in ${where}`}
              fill
              sizes={CARD_IMAGE_SIZES}
              priority={priority}
              // Interiors read better centred than cars do — no roofline to protect.
              className="object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/10 to-ink-950/20" />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-500">
            <ImageOff className="h-8 w-8" strokeWidth={1.5} />
            <span className="text-xs">No photos</span>
          </div>
        )}

        <div className="absolute right-3 top-3 z-10 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
          <BookmarkButton listingId={listing.id} />
        </div>

        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <SourceBadge platform={listing.sourcePlatform} />
          <AgeChip date={dateForAge} showIcon={false} />
          {isTaken && (
            <span className="inline-flex items-center rounded-md bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-200 ring-1 ring-inset ring-rose-500/30 backdrop-blur-md">
              Taken
            </span>
          )}
        </div>

        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-300/80">
              {rentalLabel(listing.propertyType)}
            </p>
            <h3 className="truncate font-display text-[15px] font-bold leading-tight text-ink-50">
              {bhkLabel(listing)} · {where}
            </h3>
          </div>
          <div className="shrink-0 rounded-lg border border-white/10 bg-ink-950/70 px-2.5 py-1 backdrop-blur-md">
            {rent ? (
              <p className="whitespace-nowrap font-mono text-[13px] font-bold text-accent">
                ₹{rent}
                <span className="ml-0.5 text-[9px] font-medium text-accent/70">/mo</span>
              </p>
            ) : (
              <p className="whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-wider text-electric">
                Ask rent
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="relative p-4">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs text-ink-400">
          <span className="truncate">{rentalLabel(listing.furnishing)}</span>
          {photos > 1 && (
            <span className="shrink-0 font-mono text-[10px] text-ink-500">{photos} photos</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
          <Spec icon={BedDouble} value={bhkLabel(listing)} />
          <Spec
            icon={Maximize2}
            value={listing.carpetAreaSqft ? `${listing.carpetAreaSqft} sqft` : "—"}
          />
          {/* Deposit shown in months where possible — that is how tenants
              actually compare it, and the absolute figure is on the detail page. */}
          <Spec icon={Wallet} value={months ?? (deposit ? `₹${deposit}` : "—")} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-ink-500">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            {listing.city}
          </span>
          {listing.orgName && (
            <span className="truncate font-medium text-ink-400">{listing.orgName}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function Spec({ icon: Icon, value }: { icon: typeof Sofa; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-ink-300">
      <Icon className="h-3.5 w-3.5 shrink-0 text-ink-500" strokeWidth={1.75} />
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

export function RentalCardSkeleton() {
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
      </div>
    </div>
  );
}
