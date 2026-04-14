import { z } from "zod";
import type { ImagePart, TextPart } from "@ai-sdk/provider-utils";
import { generateStructured } from "../ai/core";

type UserPart = TextPart | ImagePart;

export type ParsedCarData = {
  make: string | null;
  model: string | null;
  variant: string | null;
  year: number | null;
  price: number | null;
  kmDriven: number | null;
  fuelType: string | null;
  transmission: string | null;
  ownerCount: number | null;
  color: string | null;
  bodyType: string | null;
  sellerPhone: string | null;
  isCarListing: boolean;
};

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

const MAX_POSTS_PER_REQUEST = 6;

const EMPTY: ParsedCarData = {
  make: null,
  model: null,
  variant: null,
  year: null,
  price: null,
  kmDriven: null,
  fuelType: null,
  transmission: null,
  ownerCount: null,
  color: null,
  bodyType: null,
  sellerPhone: null,
  isCarListing: false,
};

const PostResultSchema = z.object({
  index: z.number().int().positive(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  variant: z.string().nullable(),
  year: z.number().int().nullable(),
  price: z.number().nullable(),
  kmDriven: z.number().int().nullable(),
  fuelType: z
    .enum(["petrol", "diesel", "cng", "electric", "hybrid"])
    .nullable(),
  transmission: z.enum(["manual", "automatic"]).nullable(),
  ownerCount: z.number().int().nullable(),
  color: z.string().nullable(),
  bodyType: z
    .enum([
      "sedan",
      "suv",
      "hatchback",
      "muv",
      "coupe",
      "convertible",
      "pickup",
      "van",
      "wagon",
    ])
    .nullable(),
  sellerPhone: z.string().nullable(),
  isCarListing: z.boolean(),
});

const BatchSchema = z.object({
  posts: z.array(PostResultSchema),
});

const SYSTEM_PROMPT = `You are an expert at extracting structured car listing data from Indian Instagram dealer posts.

You will be given MULTIPLE posts from a single dealer, numbered starting at 1. For each post, analyze its caption and any images that follow it, and extract car details.

Rules:
- Price is in INR. Convert lakhs notation: "4.5L" or "4.5 lakhs" = 450000
- Year is 4 digits (e.g., 2019)
- kmDriven is kilometers (e.g., "45k km" = 45000)
- If a post is NOT about selling a specific preowned car (reel, meme, ad, generic content), set isCarListing=false and leave car fields null
- Extract phone numbers if visible in caption or image overlays
- Use standard make/model names ("Maruti Suzuki" not "Maruti", "Hyundai Creta" not "creta")

Return one entry per input post, with "index" matching the 1-based post number.`;

function imageToPart(img: LlmImage): ImagePart {
  if (img.kind === "url") {
    return { type: "image", image: new URL(img.url) };
  }
  return {
    type: "image",
    image: img.data,
    mediaType: img.mediaType,
  };
}

async function extractChunk(posts: BatchPostInput[]): Promise<ParsedCarData[]> {
  if (posts.length === 0) return [];

  const content: UserPart[] = [];
  let hasAnyContent = false;

  posts.forEach((post, i) => {
    const n = i + 1;
    content.push({
      type: "text",
      text: post.caption
        ? `Post ${n} caption:\n${post.caption}`
        : `Post ${n}: (no caption)`,
    });
    for (const img of post.images) {
      content.push(imageToPart(img));
      hasAnyContent = true;
    }
    if (post.caption) hasAnyContent = true;
  });

  if (!hasAnyContent) {
    return posts.map(() => ({ ...EMPTY }));
  }

  const parsed = await generateStructured({
    schema: BatchSchema,
    schemaName: "InstagramPostCarListings",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  const results: ParsedCarData[] = Array.from(
    { length: posts.length },
    () => ({ ...EMPTY }),
  );
  for (const entry of parsed.posts) {
    const i = entry.index - 1;
    if (i < 0 || i >= posts.length) continue;
    const { index: _ignored, ...rest } = entry;
    results[i] = { ...EMPTY, ...rest };
  }
  return results;
}

export async function extractCarDataForPostsBatch(
  posts: BatchPostInput[],
): Promise<ParsedCarData[]> {
  if (posts.length === 0) return [];
  const results: ParsedCarData[] = [];
  const chunkCount = Math.ceil(posts.length / MAX_POSTS_PER_REQUEST);
  for (let i = 0; i < posts.length; i += MAX_POSTS_PER_REQUEST) {
    const chunk = posts.slice(i, i + MAX_POSTS_PER_REQUEST);
    const chunkIdx = Math.floor(i / MAX_POSTS_PER_REQUEST) + 1;
    console.log(
      `[instagram-llm] chunk ${chunkIdx}/${chunkCount} (${chunk.length} post(s))`,
    );
    const chunkResults = await extractChunk(chunk);
    results.push(...chunkResults);
  }
  return results;
}
