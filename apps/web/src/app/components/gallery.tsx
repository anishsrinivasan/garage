"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, Play, X } from "lucide-react";
import type { MediaItem } from "@/app/lib/media";

/**
 * Listing gallery with a lightbox.
 *
 * The detail page previously rendered a static hero plus four dead thumbnails —
 * there was no way to see the fifth photo, no keyboard navigation, and the
 * `<video>` branch never fired because the scraper wasn't capturing reel video
 * at all. It now does, so playback matters.
 */
export function Gallery({
  media,
  alt,
  enableLightbox = true,
}: {
  media: MediaItem[];
  alt: string;
  /**
   * Off inside the preview dialog. The dialog is already the enlarged view, so
   * a lightbox on top of it is a second overlay competing for the same Escape
   * key — press it once and both would close.
   */
  enableLightbox?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const count = media.length;
  const go = useCallback(
    (delta: number) => {
      if (count === 0) return;
      setIndex((i) => (i + delta + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    // Stop the page scrolling behind the lightbox.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen, go]);

  if (count === 0) {
    return (
      <div className="flex aspect-[3/2] flex-col items-center justify-center gap-2 rounded-2xl border border-white/5 bg-ink-900 text-ink-500">
        <ImageOff className="h-10 w-10" strokeWidth={1.3} />
        <span className="text-sm">No photos for this listing</span>
      </div>
    );
  }

  const active = media[index]!;

  return (
    <>
      <div className="space-y-2">
        <div className="group relative aspect-[3/2] overflow-hidden rounded-2xl border border-white/5 bg-ink-900">
          <MediaFrame item={active} alt={alt} primary />

          {active.type === "image" && enableLightbox && (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="absolute inset-0 cursor-zoom-in"
              aria-label="Open photo full size"
            />
          )}

          {count > 1 && (
            <>
              <NavButton side="left" onClick={() => go(-1)} />
              <NavButton side="right" onClick={() => go(1)} />
              <span className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-ink-950/70 px-2 py-0.5 font-mono text-[11px] text-ink-200 backdrop-blur-md">
                {index + 1} / {count}
              </span>
            </>
          )}
        </div>

        {count > 1 && (
          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
            role="tablist"
            aria-label="Listing photos"
          >
            {media.map((item, i) => (
              <button
                key={`${item.url}-${i}`}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Photo ${i + 1} of ${count}`}
                onClick={() => setIndex(i)}
                className={`relative aspect-[3/2] w-24 shrink-0 overflow-hidden rounded-lg border transition ${
                  i === index
                    ? "border-accent/50 ring-2 ring-accent/25"
                    : "border-white/5 opacity-60 hover:opacity-100"
                }`}
              >
                <Image
                  src={item.type === "video" ? (item.posterUrl ?? item.url) : item.url}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover object-[center_38%]"
                />
                {item.type === "video" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-ink-950/40">
                    <Play className="h-4 w-4 fill-white text-white" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/95 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close photo viewer"
            className="absolute right-4 top-4 rounded-lg border border-white/10 bg-white/5 p-2 text-ink-200 transition hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="relative h-full max-h-[85vh] w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <MediaFrame item={active} alt={alt} primary contain />
            {count > 1 && (
              <>
                <NavButton side="left" onClick={() => go(-1)} />
                <NavButton side="right" onClick={() => go(1)} />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function NavButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={`absolute top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-ink-950/70 p-2 text-ink-100 backdrop-blur-md transition hover:bg-ink-950 ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function MediaFrame({
  item,
  alt,
  primary = false,
  contain = false,
}: {
  item: MediaItem;
  alt: string;
  primary?: boolean;
  contain?: boolean;
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
        className={`h-full w-full ${contain ? "object-contain" : "object-cover"}`}
      />
    );
  }
  return (
    <Image
      src={item.url}
      alt={alt}
      fill
      sizes={contain ? "100vw" : "(min-width: 768px) 60vw, 100vw"}
      priority={primary && !contain}
      className={contain ? "object-contain" : "object-cover object-[center_38%]"}
    />
  );
}
