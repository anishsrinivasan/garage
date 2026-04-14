import { and, eq } from "drizzle-orm";
import { db, dealerSources, garages } from "@preowned-cars/db";

type Seed = {
  handle: string;
  name: string;
  city: string;
  description?: string;
};

const INSTAGRAM_DEALERS: Seed[] = [
  { handle: "chennai_preowned_cars", name: "Chennai Preowned Cars", city: "Chennai" },
  { handle: "chennai_used_cars_hub", name: "Chennai Used Cars Hub", city: "Chennai" },
  { handle: "chennaiusedcardealers", name: "Chennai Used Car Dealers", city: "Chennai" },
  { handle: "premiumcars_chennai", name: "Premium Cars Chennai", city: "Chennai" },
  { handle: "motormartchennai", name: "Motor Mart Chennai", city: "Chennai" },
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function ensureGarage(dealer: Seed): Promise<string> {
  const slug = slugify(dealer.name);
  const [existing] = await db
    .select({ id: garages.id })
    .from(garages)
    .where(eq(garages.slug, slug))
    .limit(1);
  if (existing) return existing.id;
  const [inserted] = await db
    .insert(garages)
    .values({
      slug,
      name: dealer.name,
      kind: "dealer",
      city: dealer.city,
      description: dealer.description ?? null,
      instagramUrl: `https://www.instagram.com/${dealer.handle}/`,
      isActive: true,
    })
    .returning({ id: garages.id });
  return inserted!.id;
}

async function main() {
  console.log(`Seeding ${INSTAGRAM_DEALERS.length} Instagram dealer garages...`);

  let newDealerSources = 0;
  for (const dealer of INSTAGRAM_DEALERS) {
    const garageId = await ensureGarage(dealer);
    const [existingSource] = await db
      .select({ id: dealerSources.id })
      .from(dealerSources)
      .where(
        and(
          eq(dealerSources.platform, "instagram"),
          eq(dealerSources.handle, dealer.handle),
        ),
      )
      .limit(1);
    if (existingSource) continue;
    await db.insert(dealerSources).values({
      garageId,
      platform: "instagram",
      handle: dealer.handle,
      sourceType: "instagram_dealer",
      isActive: true,
    });
    newDealerSources++;
  }

  console.log(
    `Done: ${newDealerSources} new dealer source(s) added (${INSTAGRAM_DEALERS.length - newDealerSources} already existed)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
