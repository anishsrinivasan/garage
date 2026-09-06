/**
 * Picks which image becomes the card hero.
 *
 * Instagram gives us no signal about which frame shows the car. The cover frame
 * of a reel is frequently the dealer talking to camera, and dealers pad
 * carousels with logos, price cards and interior close-ups. So we run one cheap
 * vision pass per post that scores each candidate on how well it sells the car,
 * and order the media array by that score.
 *
 * Cost control: at most `MAX_SCORED_IMAGES` candidates per post, one request per
 * post, on the same Flash-class model the extraction step already uses.
 */

import { z } from "zod";
import type { ImagePart, TextPart } from "@ai-sdk/provider-utils";
import { generateStructured } from "../ai/core";
import type { MediaSource } from "@preowned-cars/shared";

export const MAX_SCORED_IMAGES = 6;

export type ScorableImage = {
  /** Stable handle so we can map scores back onto the media array. */
  key: string;
  source: MediaSource;
  /** Public URL once uploaded to R2, else inline base64. */
  payload:
    | { kind: "url"; url: string }
    | {
        kind: "base64";
        mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
        data: string;
      };
};

export type ImageScore = {
  key: string;
  score: number;
  reason: string;
};

const ScoreSchema = z.object({
  images: z.array(
    z.object({
      index: z.number().int().positive(),
      score: z.number().int().min(0).max(100),
      showsCar: z.boolean(),
      hasPlayButtonOverlay: z.boolean(),
      personDominates: z.boolean(),
      reason: z.string().max(120),
    }),
  ),
});

const SYSTEM_PROMPT = `You rate photos for a used-car marketplace. Each image is a candidate for the single thumbnail shown on a listing card.

Score 0-100 on how well the image sells THIS car as a listing thumbnail:

90-100: Clean exterior shot, full car visible, front-three-quarter or side profile, car fills most of the frame, well lit.
70-89:  Full car visible but a weaker angle, partial crop, cluttered background, or mediocre light.
40-69:  Car is present but small, heavily obscured, or it is an interior/detail shot (wheel, badge, dashboard, engine bay).
10-39:  A person is the main subject (dealer talking to camera, presenter, customer handover), or heavy text/graphics cover the car.
0-9:    No car at all — logo card, price card, meme, showroom signage, empty room, unrelated photo.

Also set these flags:
- showsCar: a car is clearly identifiable in the frame.
- hasPlayButtonOverlay: a play triangle or video-play glyph is drawn over the image. Instagram burns one into reel cover frames; those make poor thumbnails.
- personDominates: a human is the largest or most prominent subject.

Be strict. A thumbnail where the viewer cannot immediately tell what car it is scores below 40. Give a short reason (max 12 words).

Return one entry per image, with "index" matching the 1-based image number.`;

function toPart(image: ScorableImage): ImagePart {
  if (image.payload.kind === "url") {
    return { type: "image", image: new URL(image.payload.url) };
  }
  return {
    type: "image",
    image: image.payload.data,
    mediaType: image.payload.mediaType,
  };
}

/**
 * Penalties applied on top of the model's score. A reel cover is technically a
 * frame of the car sometimes, but it always carries the play glyph, so it should
 * lose to any clean frame we extracted ourselves.
 */
const SOURCE_ADJUSTMENT: Record<MediaSource, number> = {
  carousel: 0,
  reel_frame: 0,
  reel_cover: -25,
  marketplace: 0,
  manual: 25,
};

export async function scoreImages(
  images: ScorableImage[],
  context: { handle: string; postUrl: string; carLabel: string },
): Promise<ImageScore[]> {
  if (images.length === 0) return [];

  const candidates = images.slice(0, MAX_SCORED_IMAGES);
  const content: Array<TextPart | ImagePart> = [
    {
      type: "text",
      text: `Listing: ${context.carLabel}. Rate each of the ${candidates.length} images below as a thumbnail for it.`,
    },
  ];
  candidates.forEach((image, i) => {
    content.push({ type: "text", text: `Image ${i + 1} (source: ${image.source}):` });
    content.push(toPart(image));
  });

  let parsed;
  try {
    parsed = await generateStructured({
      schema: ScoreSchema,
      schemaName: "InstagramImageScores",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
      operation: "instagram.score_images",
      metadata: {
        handle: context.handle,
        postUrl: context.postUrl,
        imageCount: candidates.length,
      },
    });
  } catch (err) {
    console.warn(
      `[image-scoring] ${context.postUrl}: scoring failed, falling back to source order — ${err instanceof Error ? err.message : String(err)}`,
    );
    return candidates.map((image, i) => ({
      key: image.key,
      // Preserve carousel order when we can't score: earlier slides are usually
      // the dealer's own chosen lead image.
      score: Math.max(0, 50 - i) + SOURCE_ADJUSTMENT[image.source],
      reason: "unscored",
    }));
  }

  const byIndex = new Map(parsed.images.map((entry) => [entry.index - 1, entry]));
  return candidates.map((image, i) => {
    const entry = byIndex.get(i);
    if (!entry) {
      return { key: image.key, score: 30, reason: "no score returned" };
    }
    let score = entry.score + SOURCE_ADJUSTMENT[image.source];
    if (entry.hasPlayButtonOverlay) score -= 20;
    if (entry.personDominates) score -= 15;
    if (!entry.showsCar) score = Math.min(score, 15);
    return {
      key: image.key,
      score: Math.max(0, Math.min(100, score)),
      reason: entry.reason,
    };
  });
}
