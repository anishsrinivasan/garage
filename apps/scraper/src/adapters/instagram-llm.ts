import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const MIN_GAP_MS = 7000;
const MAX_RETRIES = 4;
const MAX_POSTS_PER_REQUEST = 6;
let nextAvailableAt = 0;

async function waitForSlot(): Promise<void> {
  const now = Date.now();
  if (now < nextAvailableAt) {
    await new Promise((r) => setTimeout(r, nextAvailableAt - now));
  }
  nextAvailableAt = Math.max(Date.now(), nextAvailableAt) + MIN_GAP_MS;
}

function parseRetryDelayMs(err: unknown): number | null {
  const e = err as { status?: number; headers?: Record<string, string> };
  if (e?.status !== 429) return null;
  const retryAfter = e.headers?.["retry-after"];
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (!Number.isNaN(secs) && secs > 0) return Math.ceil(secs * 1000);
  }
  return null;
}

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < MAX_RETRIES) {
    await waitForSlot();
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const is429 = (err as { status?: number })?.status === 429;
      if (!is429) throw err;
      attempt++;
      const hintedDelay = parseRetryDelayMs(err);
      const backoff =
        hintedDelay ?? Math.min(60000, 5000 * 2 ** (attempt - 1));
      console.warn(
        `[instagram-llm] rate limited (429), retry ${attempt}/${MAX_RETRIES} in ${backoff}ms`,
      );
      nextAvailableAt = Date.now() + backoff;
    }
  }
  throw lastErr;
}

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

const BATCH_EXTRACTION_PROMPT = `You are an expert at extracting structured car listing data from Indian Instagram dealer posts.

You will be given MULTIPLE posts from a single dealer, numbered starting at 1. For each post, analyze its caption and any images that follow it, and extract car details.

Rules:
- Price is in INR. Convert lakhs notation: "4.5L" or "4.5 lakhs" = 450000
- Year is 4 digits (e.g., 2019)
- kmDriven is kilometers (e.g., "45k km" = 45000)
- fuelType: one of "petrol", "diesel", "cng", "electric", "hybrid"
- transmission: one of "manual", "automatic"
- bodyType: one of "sedan", "suv", "hatchback", "muv", "coupe", "convertible", "pickup", "van", "wagon"
- If a post is NOT about selling a specific preowned car (reel, meme, ad, generic content), set isCarListing=false
- Extract phone numbers if visible in caption or image overlays
- Use standard make/model names ("Maruti Suzuki" not "Maruti", "Hyundai Creta" not "creta")

Return ONLY a valid JSON object of the form:
{ "posts": [ { "index": 1, "make": ..., "model": ..., ..., "isCarListing": ... }, { "index": 2, ... }, ... ] }

Include one entry per input post, with "index" matching the post number you were given. The "posts" array must have the same length as the number of input posts.`;

function parseBatchResponse(text: string, count: number): ParsedCarData[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in Claude batch response");
  const parsed = JSON.parse(jsonMatch[0]) as {
    posts?: Array<ParsedCarData & { index?: number }>;
  };
  const arr = parsed.posts ?? [];
  const results: ParsedCarData[] = Array.from({ length: count }, () => ({ ...EMPTY }));
  for (const entry of arr) {
    if (typeof entry.index !== "number") continue;
    const i = entry.index - 1;
    if (i < 0 || i >= count) continue;
    const { index: _idx, ...rest } = entry;
    results[i] = { ...EMPTY, ...rest };
  }
  return results;
}

async function extractChunk(posts: BatchPostInput[]): Promise<ParsedCarData[]> {
  if (posts.length === 0) return [];

  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
  let hasAnyContent = false;

  posts.forEach((post, i) => {
    const n = i + 1;
    const captionText = post.caption
      ? `Post ${n} caption:\n${post.caption}`
      : `Post ${n}: (no caption)`;
    content.push({ type: "text", text: captionText });

    for (const img of post.images) {
      if (img.kind === "url") {
        content.push({
          type: "image",
          source: { type: "url", url: img.url },
        });
      } else {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType,
            data: img.data,
          },
        });
      }
      hasAnyContent = true;
    }
    if (post.caption) hasAnyContent = true;
  });

  if (!hasAnyContent) {
    return posts.map(() => ({ ...EMPTY }));
  }

  const response = await callWithRetry(() =>
    anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: BATCH_EXTRACTION_PROMPT,
      messages: [{ role: "user", content }],
    }),
  );

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return parseBatchResponse(textBlock.text, posts.length);
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
