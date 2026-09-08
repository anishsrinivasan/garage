/**
 * Scores a post's images and returns the media array hero-first.
 *
 * Generic across verticals: the rubric and the subject label both arrive from
 * the caller, because "rate this as a used-car thumbnail" and "rate this as a
 * rental interior" want opposite things from the same harness.
 *
 * The video, if any, is kept but never becomes media[0] — cards render an image,
 * and a frame we chose beats one Instagram chose.
 */

import type { MediaItem, MediaSource } from "@classifieds/shared";
import { scoreImages, type ScorableImage } from "./scoring";

export type OrderableCandidate = {
  key: string;
  url: string;
  type: "image" | "video";
  mimeType: string;
  source: MediaSource;
  width: number | null;
  height: number | null;
  posterUrl: string | null;
  scorePayload: ScorableImage["payload"] | null;
};

export async function scoreAndOrderMedia(
  candidates: OrderableCandidate[],
  context: {
    handle: string;
    postUrl: string;
    subjectLabel: string;
    systemPrompt: string;
  },
): Promise<MediaItem[]> {
  const images = candidates.filter((c) => c.type === "image");
  const videos = candidates.filter((c) => c.type === "video");

  const scorable: ScorableImage[] = images
    .filter((c) => c.scorePayload)
    .map((c) => ({ key: c.key, source: c.source, payload: c.scorePayload! }));

  const scores = await scoreImages(scorable, context);
  const byKey = new Map(scores.map((s) => [s.key, s]));

  const ordered = images
    .map((candidate) => ({
      candidate,
      score: byKey.get(candidate.key)?.score ?? 25,
      reason: byKey.get(candidate.key)?.reason ?? "unscored",
    }))
    .sort((a, b) => b.score - a.score);

  const media: MediaItem[] = ordered.map(({ candidate, score, reason }) => ({
    url: candidate.url,
    type: "image" as const,
    mimeType: candidate.mimeType,
    posterUrl: null,
    source: candidate.source,
    width: candidate.width,
    height: candidate.height,
    score,
    scoreReason: reason,
  }));

  const heroUrl = media[0]?.url ?? null;
  for (const video of videos) {
    media.push({
      url: video.url,
      type: "video",
      mimeType: video.mimeType,
      posterUrl: heroUrl ?? video.posterUrl,
      source: video.source,
      width: null,
      height: null,
      score: null,
      scoreReason: null,
    });
  }
  return media;
}
