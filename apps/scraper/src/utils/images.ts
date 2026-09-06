/**
 * Image URL harvesting for HTML-scraped marketplaces.
 *
 * CarDekho cards lazy-load their photos, so reading `src` alone got a 1x1
 * placeholder (or a `data:` URI) that validation then stripped — which is why
 * all 111 CarDekho listings shipped with zero media and rendered as "No
 * preview" tiles. We now read every attribute the lazy-loaders actually use and
 * reject the placeholders explicitly.
 */

const LAZY_ATTRS = [
  "src",
  "data-src",
  "data-lazy",
  "data-lazy-src",
  "data-original",
  "data-srcset",
  "srcset",
] as const;

const PLACEHOLDER_PATTERNS = [
  /^data:/i,
  /\b(placeholder|blank|spacer|loader|lazy|default[-_]?car|no[-_]?image)\b/i,
  /\.svg(\?|$)/i,
];

function fromSrcset(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
}

export function isUsableImageUrl(url: string): boolean {
  if (!url) return false;
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(url))) return false;
  return /^https?:\/\//i.test(url) || url.startsWith("//") || url.startsWith("/");
}

/**
 * Pulls every plausible image URL off an element's `<img>` descendants,
 * de-duplicated and resolved to absolute URLs, best-first.
 */
export function collectImageUrls(
  attrsPerImage: Array<Record<string, string | undefined>>,
  resolveUrl: (url: string) => string,
  limit = 8,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const attrs of attrsPerImage) {
    for (const attr of LAZY_ATTRS) {
      const raw = attrs[attr];
      if (!raw) continue;
      const urls = attr.includes("srcset") ? fromSrcset(raw) : [raw];
      for (const candidate of urls) {
        if (!isUsableImageUrl(candidate)) continue;
        const absolute = resolveUrl(candidate);
        if (!/^https?:\/\//i.test(absolute)) continue;
        // Ignore the CDN's resize query so the same photo at two widths
        // doesn't occupy two slots.
        const key = absolute.split("?")[0]!;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(absolute);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
