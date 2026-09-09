"use client";

/**
 * The listing preview dialog.
 *
 * Clicking a card opens this rather than navigating. Browsing a feed is a
 * comparison task — you look at one, decide no, look at the next — and a full
 * page load per glance turns that into a queue of back-button presses. The
 * dedicated page is still there behind "Open full listing", and is still what
 * the card's href points at, so middle-click and right-click reach it and
 * crawlers still see a real link.
 *
 * Which listing is open lives in the URL (`?preview=<id>`), so the dialog
 * survives reload, closes on Back, and can be linked to.
 *
 * Rendered through a portal into <body>. `position: fixed` is relative to the
 * viewport only while no ancestor establishes a containing block, and any
 * ancestor with a transform does — the saved page wraps its content in
 * `animate-fade-in-up`, which was enough to pin the overlay inside the page
 * body and clip it against the footer.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  ExternalLink,
  MapPin,
  Gauge,
  Fuel,
  Settings2,
  BedDouble,
  Ruler,
  Sofa,
  Wallet,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { usePreview } from "@/app/lib/use-preview";
import { orderedGallery, type MediaItem } from "@/app/lib/media";
import { Gallery } from "./gallery";
import { formatPrice, formatKm, enumLabel } from "@/app/lib/format";
import { formatRent, formatLumpSum, rentalTitle, rentalLabel } from "@/app/lib/rental-format";
import { SourceBadge } from "./source-badge";
import { BookmarkButton } from "./bookmark-button";
import { AgeChip } from "./age-chip";

type PreviewResponse = {
  vertical: "cars" | "rentals";
  // The row comes straight from the detail query, which selects far more than
  // a card needs. Narrowing it here would mean maintaining a second copy of two
  // table shapes for no gain, so read the handful of fields we render.
  listing: Record<string, unknown>;
};

async function fetchListing(id: string): Promise<PreviewResponse> {
  const res = await fetch(`/api/listing/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
  return res.json();
}

export function ListingPreview() {
  const { previewId, close } = usePreview();
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, isPending, isError } = useQuery({
    queryKey: ["preview", previewId],
    queryFn: () => fetchListing(previewId!),
    enabled: previewId != null,
  });

  // Escape closes, and the page behind must not scroll while the dialog is up —
  // on touch especially, a dialog over a scrolling feed loses its place.
  useEffect(() => {
    if (!previewId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [previewId, close]);

  useEffect(() => {
    if (previewId) panelRef.current?.focus();
  }, [previewId, data]);

  if (!previewId) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={close}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Listing preview"
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-in-up relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-white/10 bg-ink-900 shadow-2xl outline-none sm:rounded-2xl"
      >
        <button
          onClick={close}
          aria-label="Close preview"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-ink-950/70 text-ink-300 backdrop-blur transition hover:bg-ink-950 hover:text-ink-50"
        >
          <X className="h-4 w-4" />
        </button>

        {isPending ? (
          <PreviewSkeleton />
        ) : isError || !data ? (
          <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
            <p className="font-display text-lg font-semibold text-ink-200">
              Could not load this listing.
            </p>
            <p className="max-w-sm text-sm text-ink-500">
              It may have been taken down since the page loaded.
            </p>
          </div>
        ) : data.vertical === "cars" ? (
          <CarPreview listing={data.listing} onClose={close} />
        ) : (
          <RentalPreview listing={data.listing} onClose={close} />
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ shared */

function PreviewSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[16/10] w-full bg-white/[0.04]" />
      <div className="space-y-3 p-6">
        <div className="h-7 w-2/3 rounded bg-white/[0.05]" />
        <div className="h-4 w-1/3 rounded bg-white/[0.04]" />
        <div className="h-20 w-full rounded bg-white/[0.03]" />
      </div>
    </div>
  );
}

/**
 * The detail page's gallery, reused verbatim.
 *
 * The dialog first rendered every item as an <Image>, which drew a black
 * rectangle wherever a listing's last item was a reel — Instagram rentals often
 * end on one. Gallery already plays video, shows the poster frame in the strip
 * and marks it with a play badge, so the preview and the detail page now behave
 * identically rather than diverging as either changes.
 */
function PreviewMedia({ media, alt }: { media: MediaItem[]; alt: string }) {
  return (
    <div className="p-4 pb-0 sm:p-5 sm:pb-0">
      <Gallery media={media} alt={alt} enableLightbox={false} />
    </div>
  );
}

function Spec({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-600" />
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-600">{label}</p>
        <p className="text-sm text-ink-200">{value}</p>
      </div>
    </div>
  );
}

function PreviewActions({
  id,
  href,
  sourceUrl,
  onClose,
}: {
  id: string;
  href: string;
  sourceUrl: string | null;
  onClose: () => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/5 pt-5">
      <Link
        href={href}
        onClick={onClose}
        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/15"
      >
        Open full listing
        <ArrowUpRight className="h-4 w-4" />
      </Link>
      <BookmarkButton listingId={id} size="md" />
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-500 transition hover:text-ink-300"
        >
          View on source
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function Description({ text }: { text: unknown }) {
  if (typeof text !== "string" || !text.trim()) return null;
  return (
    <p className="mt-6 whitespace-pre-line border-t border-white/5 pt-5 text-sm leading-relaxed text-ink-400">
      {text.trim()}
    </p>
  );
}

/* -------------------------------------------------------------------- cars */

function CarPreview({
  listing,
  onClose,
}: {
  listing: Record<string, unknown>;
  onClose: () => void;
}) {
  const l = listing as {
    id: string;
    make: string;
    model: string;
    variant: string | null;
    year: number;
    price: string | null;
    kmDriven: number | null;
    fuelType: string | null;
    transmission: string | null;
    city: string;
    sourcePlatform: string;
    sourceUrl: string | null;
    description: string | null;
    media: MediaItem[] | null;
    heroMediaUrl?: string | null;
    listedAt?: string | null;
    firstSeenAt?: string | null;
    garageName?: string | null;
  };

  const title = `${l.make} ${l.model}`;
  const media = orderedGallery(l.media, l.heroMediaUrl);
  const price = formatPrice(l.price);

  return (
    <>
      <PreviewMedia key={l.id} media={media} alt={`${l.year} ${title}`} />
      <div className="p-6">
        <div className="flex items-center gap-2">
          <SourceBadge platform={l.sourcePlatform} />
          <AgeChip date={l.listedAt ?? l.firstSeenAt ?? null} />
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs tracking-[0.16em] text-ink-500">{l.year}</p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink-50">{title}</h2>
            {l.variant && <p className="mt-1 text-sm text-ink-400">{l.variant}</p>}
          </div>
          {/* A third of cars carry no price; an empty slot read as broken. */}
          <p className="font-mono text-2xl font-bold text-accent">
            {price ? `₹${price}` : <span className="text-base text-ink-500">Ask price</span>}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Spec icon={Gauge} label="Driven" value={formatKm(l.kmDriven)} />
          <Spec icon={Fuel} label="Fuel" value={enumLabel(l.fuelType)} />
          <Spec icon={Settings2} label="Gearbox" value={enumLabel(l.transmission)} />
          <Spec icon={MapPin} label="Where" value={l.garageName ?? l.city} />
        </div>

        <PreviewActions
          id={l.id}
          href={`/listings/${l.id}`}
          sourceUrl={l.sourceUrl}
          onClose={onClose}
        />
        <Description text={l.description} />
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- rentals */

function RentalPreview({
  listing,
  onClose,
}: {
  listing: Record<string, unknown>;
  onClose: () => void;
}) {
  const l = listing as {
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
    sourceUrl: string | null;
    description: string | null;
    media: MediaItem[] | null;
    heroMediaUrl?: string | null;
    listedAt?: string | null;
    firstSeenAt?: string | null;
    orgName?: string | null;
    gatedCommunity?: boolean | null;
  };

  const title = rentalTitle(l);
  const media = orderedGallery(l.media, l.heroMediaUrl);
  const rent = formatRent(l.rent);
  const deposit = formatLumpSum(l.deposit);

  return (
    <>
      <PreviewMedia key={l.id} media={media} alt={title} />
      <div className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge platform={l.sourcePlatform} />
          <AgeChip date={l.listedAt ?? l.firstSeenAt ?? null} />
          {/* Shown only when true. The column is null for most listings, and a
              "not gated" badge would assert something no caption ever said. */}
          {l.gatedCommunity === true && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
              <ShieldCheck className="h-3 w-3" />
              Gated
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink-500">
              {enumLabel(l.propertyType)}
            </p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink-50">{title}</h2>
            {(l.localityName ?? l.locationText) && (
              <p className="mt-1 text-sm text-ink-400">{l.localityName ?? l.locationText}</p>
            )}
          </div>
          {rent && (
            <p className="font-mono text-2xl font-bold text-accent">
              ₹{rent}
              <span className="ml-1 text-sm text-ink-400">/mo</span>
            </p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Spec
            icon={BedDouble}
            label="Layout"
            value={l.bhk != null ? `${l.bhk} BHK` : null}
          />
          <Spec
            icon={Ruler}
            label="Area"
            value={l.carpetAreaSqft ? `${l.carpetAreaSqft.toLocaleString("en-IN")} sqft` : null}
          />
          <Spec icon={Sofa} label="Furnishing" value={rentalLabel(l.furnishing)} />
          <Spec icon={Wallet} label="Deposit" value={deposit ? `₹${deposit}` : null} />
        </div>

        <PreviewActions
          id={l.id}
          href={`/rent/${l.id}`}
          sourceUrl={l.sourceUrl}
          onClose={onClose}
        />
        <Description text={l.description} />
      </div>
    </>
  );
}
