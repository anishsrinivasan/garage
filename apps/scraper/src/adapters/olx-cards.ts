/**
 * Reading OLX result cards, shared by the cars and rentals adapters.
 *
 * Both verticals sit on the same markup and the same bot check; only the
 * meaning of the fields differs. Keeping one reader means a redesign — and OLX
 * has already had one, which removed the `data-aut-id` hooks this used to use —
 * has to be fixed once rather than twice.
 */
import type { Page } from "playwright";

export type OlxListingCard = {
  title: string;
  price: string;
  location: string;
  url: string;
  imageUrl: string;
  meta: string;
};

/**
 * Reads the result cards.
 *
 * OLX has removed the `data-aut-id` attributes this used to key on — they now
 * return zero — and the surviving class names are build-hashed (`_3V_Ww`), so
 * they are worthless as selectors. The stable structure is the item link and
 * the list item around it, and the fields come out of `innerText`, which keeps
 * one line per block. The lines are matched on shape rather than position,
 * because the posted date moves around within the card:
 *
 *   cars    ["FEATURED", "₹ 10,40,000", "Aug 22", "2024 - 24,000 km",
 *            "Hyundai Venue", "Chennai Central"]
 *   rentals ["FEATURED", "₹ 16,000", "2 BHK - 2 Bathroom - 800 sqft",
 *            "<title>", "TRIPLICANE, CHENNAI", "AUG 30"]
 */
export async function extractOlxCards(page: Page): Promise<OlxListingCard[]> {
  return page.evaluate(() => {
    const seen = new Set<string>();
    const cards: {
      title: string;
      price: string;
      location: string;
      url: string;
      imageUrl: string;
      meta: string;
    }[] = [];

    for (const anchor of Array.from(document.querySelectorAll('a[href*="/item/"]'))) {
      const href = anchor.getAttribute("href");
      if (!href || seen.has(href)) continue;
      seen.add(href);

      const card = anchor.closest("li") ?? anchor.parentElement;
      if (!card) continue;

      const lines = (card as HTMLElement).innerText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => l.toUpperCase() !== "FEATURED");

      const price = lines.find((l) => l.includes("₹")) ?? "";
      // Cars carry "2024 - 24,000 km"; rentals "2 BHK - 2 Bathroom - 800 sqft".
      const meta =
        lines.find((l) => /\d{4}\s*-\s*[\d,]+\s*km/i.test(l)) ??
        lines.find((l) => /\d+\s*BHK/i.test(l)) ??
        "";
      // A date, not a place: "Aug 22", "2 DAYS AGO", "TODAY".
      const isDate = (l: string) =>
        /^\d+\s+(day|hour|minute|week|month)s?\s+ago$/i.test(l) ||
        /^(today|yesterday)$/i.test(l) ||
        /^[a-z]{3}\s+\d{1,2}$/i.test(l);
      const location =
        lines.filter((l) => /chennai/i.test(l) && !isDate(l)).pop() ??
        lines.filter((l) => l !== price && l !== meta && !isDate(l)).pop() ??
        "";
      const title =
        lines.find(
          (l) => l !== price && l !== meta && l !== location && !isDate(l),
        ) ?? "";

      const img = card.querySelector("img");
      cards.push({
        title,
        price,
        location,
        url: href.startsWith("http") ? href : `https://www.olx.in${href}`,
        imageUrl: img?.getAttribute("src") ?? "",
        meta,
      });
    }

    return cards;
  });
}
