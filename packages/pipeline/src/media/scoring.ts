/**
 * Picks which image becomes the card hero.
 *
 * Instagram gives us no signal about which frame shows the subject. A reel's
 * cover frame is frequently the dealer talking to camera, and suppliers pad
 * carousels with logos, price cards and detail shots. So we run one cheap vision
 * pass per post that scores each candidate, and order the media array by it.
 *
 * The *rubric* is domain knowledge and arrives as `systemPrompt` from the
 * vertical — "rate this as a used-car thumbnail" and "rate this as a rental
 * interior" want opposite things. Everything else here is generic.
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

export type ScoringContext = {
  handle: string;
  postUrl: string;
  /** Human label for what is being sold, e.g. "2023 BMW X5" or "2BHK in Adyar". */
  subjectLabel: string;
  /** The vertical's rubric. See verticals/<id>/prompts.ts. */
  systemPrompt: string;
};

export async function scoreImages(
  images: ScorableImage[],
  context: ScoringContext,
): Promise<ImageScore[]> {
  if (images.length === 0) return [];

  const candidates = images.slice(0, MAX_SCORED_IMAGES);
  const content: Array<TextPart | ImagePart> = [
    {
      type: "text",
      text: `Listing: ${context.subjectLabel}. Rate each of the ${candidates.length} images below as a thumbnail for it.`,
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
      system: context.systemPrompt,
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
