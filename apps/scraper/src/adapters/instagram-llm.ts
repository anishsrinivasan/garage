import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

type ParsedCarData = {
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

const EXTRACTION_PROMPT = `You are an expert at extracting structured car listing data from Indian Instagram dealer posts.

Analyze the provided Instagram post (caption and/or images) and extract car details.

Rules:
- Price is in INR (Indian Rupees). Convert lakhs notation: "4.5L" or "4.5 lakhs" = 450000
- Year should be 4 digits (e.g., 2019)
- kmDriven should be in kilometers (e.g., "45k km" = 45000)
- fuelType: one of "petrol", "diesel", "cng", "electric", "hybrid"
- transmission: one of "manual", "automatic"
- bodyType: one of "sedan", "suv", "hatchback", "muv", "coupe", "convertible", "pickup", "van", "wagon"
- If the post is NOT about selling a specific preowned car (e.g., it's a reel, meme, ad, or generic content), set isCarListing to false
- Extract phone numbers if visible in caption or image overlays
- For make/model, use standard names (e.g., "Maruti Suzuki" not "Maruti", "Hyundai Creta" not "creta")

Return ONLY valid JSON matching this schema:
{
  "make": string | null,
  "model": string | null,
  "variant": string | null,
  "year": number | null,
  "price": number | null,
  "kmDriven": number | null,
  "fuelType": string | null,
  "transmission": string | null,
  "ownerCount": number | null,
  "color": string | null,
  "bodyType": string | null,
  "sellerPhone": string | null,
  "isCarListing": boolean
}`;

export async function extractCarDataFromPost(
  caption: string,
  imageUrls: string[]
): Promise<ParsedCarData> {
  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  if (caption) {
    content.push({
      type: "text",
      text: `Instagram post caption:\n${caption}`,
    });
  }

  for (const url of imageUrls.slice(0, 4)) {
    content.push({
      type: "image",
      source: { type: "url", url },
    });
  }

  if (content.length === 0) {
    return {
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
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: EXTRACTION_PROMPT,
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }

  return JSON.parse(jsonMatch[0]) as ParsedCarData;
}
