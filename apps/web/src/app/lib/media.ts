/**
 * Structural mirror of the `media` jsonb column. Deliberately not the shared
 * `MediaItem`: Drizzle types `source` as a plain string (jsonb has no enums),
 * and re-using the narrower shared union would force a cast at every render
 * site for no safety gain.
 */
export type MediaItem = {
  url: string;
  type: "image" | "video";
  mimeType?: string | null;
  posterUrl?: string | null;
  source?: string | null;
  width?: number | null;
  height?: number | null;
  score?: number | null;
  scoreReason?: string | null;
};

/**
 * Picks the image a card should show.
 *
 * Order of preference:
 *  1. An admin's explicit `heroMediaUrl` override.
 *  2. The highest-scoring image from the vision pass.
 *  3. Any image at all.
 *  4. A video's poster frame.
 *
 * The scraper already stores media hero-first, but the override and the score
 * comparison are re-applied here so a row written before scoring existed, or
 * corrected by hand in the admin, still renders the right photo.
 */
export function pickHeroImage(
  media: MediaItem[] | null | undefined,
  heroMediaUrl?: string | null,
): MediaItem | null {
  const items = (media ?? []).filter((m) => m && typeof m.url === "string" && m.url);
  if (items.length === 0) return null;

  if (heroMediaUrl) {
    const override = items.find((m) => m.url === heroMediaUrl);
    if (override) return override;
    // The override may point at an image no longer in the array (e.g. uploaded
    // separately); honour it anyway.
    return { url: heroMediaUrl, type: "image" };
  }

  const images = items.filter((m) => m.type === "image");
  if (images.length > 0) {
    const scored = images.filter((m) => typeof m.score === "number");
    if (scored.length > 0) {
      return scored.reduce((best, item) =>
        (item.score ?? 0) > (best.score ?? 0) ? item : best,
      );
    }
    return images[0]!;
  }

  const withPoster = items.find((m) => m.posterUrl);
  if (withPoster?.posterUrl) {
    return { url: withPoster.posterUrl, type: "image" };
  }
  return null;
}

/** Gallery order: hero first, then remaining images by score, then videos. */
export function orderedGallery(
  media: MediaItem[] | null | undefined,
  heroMediaUrl?: string | null,
): MediaItem[] {
  const items = (media ?? []).filter((m) => m && typeof m.url === "string" && m.url);
  const hero = pickHeroImage(items, heroMediaUrl);

  const images = items
    .filter((m) => m.type === "image" && m.url !== hero?.url)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const videos = items.filter((m) => m.type === "video");

  return [...(hero ? [hero] : []), ...images, ...videos];
}

export function hasVideo(media: MediaItem[] | null | undefined): boolean {
  return (media ?? []).some((m) => m?.type === "video");
}

/** How many distinct photos we can show, for the "+3 photos" affordance. */
export function imageCount(media: MediaItem[] | null | undefined): number {
  return (media ?? []).filter((m) => m?.type === "image").length;
}
