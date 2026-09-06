"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { setHeroMedia } from "@/lib/actions";

type MediaItem = {
  url: string;
  type: "image" | "video";
  source?: string | null;
  score?: number | null;
  scoreReason?: string | null;
};

/**
 * Manual hero override.
 *
 * The vision scorer usually gets this right, but when it doesn't the fix should
 * take one click rather than a re-scrape. The score and the model's reasoning
 * are shown so it is obvious *why* a bad image won.
 */
export function HeroPicker({
  listingId,
  media,
  heroMediaUrl,
}: {
  listingId: string;
  media: MediaItem[];
  heroMediaUrl: string | null;
}) {
  const [selected, setSelected] = useState(heroMediaUrl);
  const [pending, startTransition] = useTransition();

  const images = media.filter((m) => m.type === "image");
  if (images.length === 0) {
    return <p className="text-xs text-ink-500">This listing has no photos.</p>;
  }

  // Without an override, media[0] is the hero — the scraper stores hero-first.
  const effective = selected ?? images[0]?.url ?? null;

  function choose(url: string | null) {
    setSelected(url);
    startTransition(async () => {
      await setHeroMedia(listingId, url);
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {images.map((item) => {
          const isHero = item.url === effective;
          return (
            <button
              key={item.url}
              type="button"
              onClick={() => choose(item.url)}
              disabled={pending}
              title={
                item.score != null
                  ? `Score ${item.score}${item.scoreReason ? ` — ${item.scoreReason}` : ""}`
                  : "Not scored"
              }
              className={`relative aspect-[3/2] overflow-hidden rounded-lg border transition ${
                isHero
                  ? "border-accent ring-2 ring-accent/30"
                  : "border-white/10 opacity-70 hover:opacity-100"
              }`}
            >
              <Image src={item.url} alt="" fill sizes="120px" className="object-cover" />
              {isHero && (
                <span className="absolute right-1 top-1 rounded bg-accent p-0.5 text-ink-950">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              )}
              <span className="absolute bottom-1 left-1 rounded bg-ink-950/80 px-1 font-mono text-[9px] text-ink-200">
                {item.score ?? "—"}
                {item.source === "reel_cover" ? " cov" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        {pending && <Loader2 className="h-3 w-3 animate-spin text-accent" />}
        {heroMediaUrl && (
          <button
            type="button"
            onClick={() => choose(null)}
            disabled={pending}
            className="inline-flex items-center gap-1 text-[11px] text-ink-400 hover:text-ink-100"
          >
            <RotateCcw className="h-3 w-3" />
            Clear override, use the scored order
          </button>
        )}
      </div>
      <p className="text-[10px] text-ink-600">
        Numbers are the vision score (0–100). &ldquo;cov&rdquo; marks
        Instagram&apos;s reel cover frame, which has a play glyph burned in.
      </p>
    </div>
  );
}
