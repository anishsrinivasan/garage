import Link from "next/link";
import { Fuel, Gauge, Settings2, MapPin, ImageOff, Play } from "lucide-react";
import { formatPrice, formatKm, capitalize } from "@/app/lib/format";
import { SourceBadge } from "./source-badge";

type MediaItem = {
  url: string;
  type: "image" | "video";
  mimeType?: string | null;
  posterUrl?: string | null;
};

interface Listing {
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
}

export function ListingCard({ listing }: { listing: Listing }) {
  const media = listing.media ?? [];
  const primary =
    media.find((m) => m.type === "image") ?? media[0] ?? null;
  const previewUrl = primary?.type === "image" ? primary.url : primary?.posterUrl ?? null;
  const hasVideo = media.some((m) => m.type === "video");
  const isSold = listing.saleStatus === "sold";

  return (
    <Link
      href={`/listings/${listing.id}`}
      className={`group relative block overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-850/40 shadow-card backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.14] hover:shadow-card-hover ${
        isSold ? "opacity-70" : ""
      }`}
    >
      <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-accent/0 via-accent/0 to-accent/0 opacity-0 transition-opacity duration-500 group-hover:from-accent/20 group-hover:via-pink-500/5 group-hover:to-electric/20 group-hover:opacity-100" />

      <div className="relative aspect-[4/3] overflow-hidden bg-ink-900">
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={`${listing.make} ${listing.model}`}
              className="h-full w-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-ink-950/10 to-transparent" />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-500">
            <ImageOff className="h-8 w-8" strokeWidth={1.5} />
            <span className="text-xs">No preview</span>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <SourceBadge platform={listing.sourcePlatform} />
          {hasVideo && (
            <span className="inline-flex items-center gap-1 rounded-md bg-ink-950/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-50 ring-1 ring-inset ring-white/10 backdrop-blur-md">
              <Play className="h-2.5 w-2.5 fill-current" strokeWidth={2.5} />
              Reel
            </span>
          )}
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
          <div className="shrink-0 rounded-lg border border-white/10 bg-ink-950/70 px-2.5 py-1 backdrop-blur-md">
            <p className="whitespace-nowrap font-mono text-[13px] font-bold text-accent">
              ₹{formatPrice(listing.price)}
            </p>
          </div>
        </div>
      </div>

      <div className="relative p-4">
        {listing.variant && (
          <p className="mb-3 truncate text-xs text-ink-400">{listing.variant}</p>
        )}

        <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
          <Spec icon={Gauge} value={formatKm(listing.kmDriven)} />
          <Spec icon={Fuel} value={capitalize(listing.fuelType) || "—"} />
          <Spec icon={Settings2} value={capitalize(listing.transmission) || "—"} />
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-500">
          <MapPin className="h-3 w-3" />
          <span>{listing.city}</span>
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
