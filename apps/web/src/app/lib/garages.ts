import { db, garages, carListings, dealerSources } from "@preowned-cars/db";
import { and, asc, count, desc, eq } from "drizzle-orm";

export type GarageKind = "dealer" | "marketplace";

export type GarageSummary = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  description: string | null;
  city: string | null;
  phone: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  logoUrl: string | null;
  listingCount: number;
};

export async function getGarages(options?: {
  kind?: GarageKind;
}): Promise<GarageSummary[]> {
  const conditions = [eq(garages.isActive, true)];
  if (options?.kind) conditions.push(eq(garages.kind, options.kind));
  return db
    .select({
      id: garages.id,
      slug: garages.slug,
      name: garages.name,
      kind: garages.kind,
      description: garages.description,
      city: garages.city,
      phone: garages.phone,
      websiteUrl: garages.websiteUrl,
      instagramUrl: garages.instagramUrl,
      logoUrl: garages.logoUrl,
      listingCount: count(carListings.id),
    })
    .from(garages)
    .leftJoin(
      carListings,
      and(
        eq(carListings.garageId, garages.id),
        eq(carListings.isActive, true),
      ),
    )
    .where(and(...conditions))
    .groupBy(garages.id)
    .orderBy(desc(count(carListings.id)), asc(garages.name));
}

export async function getGarageBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(garages)
    .where(and(eq(garages.slug, slug), eq(garages.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function getGarageSources(garageId: string) {
  return db
    .select({
      id: dealerSources.id,
      platform: dealerSources.platform,
      handle: dealerSources.handle,
      sourceType: dealerSources.sourceType,
      isActive: dealerSources.isActive,
    })
    .from(dealerSources)
    .where(eq(dealerSources.garageId, garageId));
}

export async function getListingsForGarage(garageId: string, limit = 48) {
  return db
    .select()
    .from(carListings)
    .where(
      and(
        eq(carListings.isActive, true),
        eq(carListings.garageId, garageId),
      ),
    )
    .orderBy(desc(carListings.scrapedAt))
    .limit(limit);
}
