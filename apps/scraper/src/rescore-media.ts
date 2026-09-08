/**
 * Re-scores media that is already stored, without touching Instagram.
 *
 *   bun run apps/scraper/src/rescore-media.ts [--vertical rentals] [--limit 50] [--all]
 *
 * A listing's hero is chosen once, at scrape time, and then frozen in the row.
 * That is usually right — the images do not change — but it means a fix to the
 * scoring rubric only reaches listings scraped afterwards. When `showsCar` was
 * renamed to `showsSubject`, every rental scored before the change kept a hero
 * picked from candidates that had all been pinned at 15, which is to say picked
 * arbitrarily. 43 of 63 were in that state and re-scraping to fix a display
 * decision would have been absurd: the bytes are already in R2.
 *
 * Only listings whose candidates all scored at or below the cap are touched by
 * default, so this is cheap to re-run and will not undo a good ordering.
 */

import { eq, sql } from "drizzle-orm";
import { db, listings } from "@classifieds/db";
import { scoreAndOrderMedia, type OrderableCandidate } from "@classifieds/pipeline";
import { getVertical } from "@classifieds/verticals";
import type { MediaItem } from "@classifieds/shared";

/** The value the old `showsCar` branch clamped every unrecognised image to. */
const LEGACY_CAP = 15;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const vertical = flag(args, "--vertical");
  const limit = Number(flag(args, "--limit") ?? 200);
  const all = args.includes("--all");

  const rows = await db
    .select({
      id: listings.id,
      vertical: listings.vertical,
      make: listings.make,
      model: listings.model,
      media: listings.media,
      sourceUrl: listings.sourceUrl,
    })
    .from(listings)
    .where(
      sql`${listings.isActive}
          and jsonb_array_length(coalesce(${listings.media}, '[]'::jsonb)) > 1
          ${vertical ? sql`and ${listings.vertical} = ${vertical}` : sql``}
          ${
            all
              ? sql``
              : // Everything at or under the cap means the ordering carries no
                // information — there was nothing to sort by.
                sql`and not exists (
                    select 1 from jsonb_array_elements(${listings.media}) m
                    where (m->>'score')::int > ${LEGACY_CAP}
                  )`
          }`,
    )
    .limit(limit);

  if (rows.length === 0) {
    console.log("[rescore] nothing to do — no listing has an uninformative ordering");
    return;
  }

  console.log(`[rescore] ${rows.length} listing(s) to re-score`);
  let improved = 0;
  let unchanged = 0;
  let failed = 0;

  for (const [i, row] of rows.entries()) {
    const media = (row.media ?? []) as MediaItem[];
    const images = media.filter((m) => m.type === "image" && m.url);
    if (images.length < 2) {
      unchanged += 1;
      continue;
    }

    const candidates: OrderableCandidate[] = media
      .filter((m) => m.url)
      .map((m, idx) => ({
        key: `${idx}`,
        url: m.url,
        type: m.type === "video" ? "video" : "image",
        mimeType: m.mimeType ?? "image/jpeg",
        // Older rows predate the source field; treat those as carousel images,
        // which is what they were before reels were handled separately.
        source: m.source ?? "carousel",
        width: m.width ?? null,
        height: m.height ?? null,
        posterUrl: m.posterUrl ?? null,
        // The bytes have been in R2 for a while, so a URL is safe here — unlike
        // at scrape time, when handing the model a just-uploaded object raced
        // CDN propagation and timed out.
        scorePayload:
          m.type === "video" ? null : { kind: "url" as const, url: m.url },
      }));

    const before = images[0]!.url;

    try {
      const reordered = await scoreAndOrderMedia(candidates, {
        handle: "rescore",
        postUrl: row.sourceUrl ?? row.id,
        subjectLabel: `${row.make} ${row.model}`.trim().slice(0, 60),
        systemPrompt: getVertical(row.vertical).imageScoringPrompt,
      });

      const after = reordered.find((m) => m.type === "image");
      await db
        .update(listings)
        .set({ media: reordered, heroMediaUrl: after?.url ?? null, updatedAt: new Date() })
        .where(eq(listings.id, row.id));

      if (after && after.url !== before) improved += 1;
      else unchanged += 1;

      const top = after?.score ?? 0;
      console.log(
        `[rescore] ${i + 1}/${rows.length} ${row.vertical} ${String(row.make).slice(0, 34)} — hero ${top}${after && after.url !== before ? " (changed)" : ""}`,
      );
    } catch (err) {
      failed += 1;
      console.warn(
        `[rescore] ${i + 1}/${rows.length} failed for ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(
    `[rescore] done. ${improved} hero(es) changed, ${unchanged} kept, ${failed} failed.`,
  );
}

await main();
process.exit(0);
