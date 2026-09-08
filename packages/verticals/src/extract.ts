/**
 * Batched extraction, driven by whichever vertical owns the source.
 *
 * This replaces the car-specific batch extractor. The batching, chunking,
 * index-mapping and image-attachment logic were never about cars — only the
 * schema and the prompt were, and both now arrive from the vertical.
 */

import { z, type ZodType } from "zod";
import type { ImagePart, TextPart } from "@ai-sdk/provider-utils";
import { generateStructured } from "@preowned-cars/pipeline";
import type { Vertical } from "./types";

type UserPart = TextPart | ImagePart;

export type LlmImage =
  | { kind: "url"; url: string }
  | {
      kind: "base64";
      mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
      data: string;
    };

export type BatchPostInput = {
  postUrl: string;
  caption: string;
  images: LlmImage[];
};

/**
 * Six posts per request. Larger batches lose accuracy on the later entries —
 * the model starts collapsing details across posts — and smaller ones waste the
 * shared prompt.
 */
const MAX_POSTS_PER_REQUEST = 6;

function imageToPart(img: LlmImage): ImagePart {
  if (img.kind === "url") return { type: "image", image: new URL(img.url) };
  return { type: "image", image: img.data, mediaType: img.mediaType };
}

/**
 * Runs one chunk. Returns one entry per input post, in input order, with holes
 * where the model returned nothing — never a shorter array, because callers
 * index results against posts positionally.
 */
async function extractChunk<T extends { index: number }>(
  vertical: Vertical<unknown>,
  posts: BatchPostInput[],
  metadata: Record<string, unknown>,
): Promise<Array<T | null>> {
  if (posts.length === 0) return [];

  const content: UserPart[] = [];
  let hasContent = false;

  posts.forEach((post, i) => {
    content.push({
      type: "text",
      text: post.caption
        ? `Post ${i + 1} caption:\n${post.caption}`
        : `Post ${i + 1}: (no caption)`,
    });
    for (const img of post.images) {
      content.push(imageToPart(img));
      hasContent = true;
    }
    if (post.caption) hasContent = true;
  });

  if (!hasContent) return posts.map(() => null);

  const batchSchema = z.object({
    posts: z.array(vertical.extractionSchema as ZodType<T>),
  });

  const parsed = (await generateStructured({
    schema: batchSchema,
    schemaName: `${vertical.id}PostExtraction`,
    system: vertical.extractionPrompt,
    messages: [{ role: "user", content }],
    operation: `${vertical.id}.extract_batch`,
    metadata: {
      ...metadata,
      vertical: vertical.id,
      postCount: posts.length,
      postUrls: posts.map((p) => p.postUrl),
      totalImages: posts.reduce((sum, p) => sum + p.images.length, 0),
    },
  })) as { posts: T[] };

  const results: Array<T | null> = posts.map(() => null);
  for (const entry of parsed.posts) {
    const i = entry.index - 1;
    if (i >= 0 && i < posts.length) results[i] = entry;
  }
  return results;
}

export async function extractPostsBatch<T extends { index: number }>(
  vertical: Vertical<unknown>,
  posts: BatchPostInput[],
  context: { handle: string },
): Promise<Array<T | null>> {
  if (posts.length === 0) return [];

  const results: Array<T | null> = [];
  const chunkCount = Math.ceil(posts.length / MAX_POSTS_PER_REQUEST);

  for (let i = 0; i < posts.length; i += MAX_POSTS_PER_REQUEST) {
    const chunk = posts.slice(i, i + MAX_POSTS_PER_REQUEST);
    const chunkIdx = Math.floor(i / MAX_POSTS_PER_REQUEST) + 1;
    console.log(
      `[${vertical.id}-llm] chunk ${chunkIdx}/${chunkCount} (${chunk.length} post(s))`,
    );
    results.push(
      ...(await extractChunk<T>(vertical, chunk, {
        handle: context.handle,
        chunkIndex: chunkIdx,
        chunkCount,
      })),
    );
  }
  return results;
}
