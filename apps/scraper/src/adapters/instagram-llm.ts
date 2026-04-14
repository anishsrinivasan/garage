import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

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

export type BatchPostInput = {
  postUrl: string;
  caption: string;
  imageUrls: string[];
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

const MAX_IMAGES_PER_POST = 2;
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

export async function extractCarDataForPostsBatch(
  posts: BatchPostInput[],
): Promise<ParsedCarData[]> {
  if (posts.length === 0) return [];

  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
  let hasAnyContent = false;

  posts.forEach((post, i) => {
    const n = i + 1;
    const captionText = post.caption
      ? `Post ${n} caption:\n${post.caption}`
      : `Post ${n}: (no caption)`;
    content.push({ type: "text", text: captionText });

    const images = post.imageUrls.slice(0, MAX_IMAGES_PER_POST);
    for (const url of images) {
      content.push({ type: "image", source: { type: "url", url } });
      hasAnyContent = true;
    }
    if (post.caption) hasAnyContent = true;
  });

  if (!hasAnyContent) {
    return posts.map(() => ({ ...EMPTY }));
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: BATCH_EXTRACTION_PROMPT,
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return parseBatchResponse(textBlock.text, posts.length);
}
