"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, cities, localities, listings } from "@classifieds/db";
import { requireSession } from "./session";

/**
 * Master data for geography.
 *
 * Localities are seeded from OpenStreetMap, but no gazetteer contains how
 * brokers actually write a place — "near Adyar signal", "OMR Perungudi". The
 * alias list is the thing that gets edited constantly, so it is the thing this
 * screen makes fast.
 */

export type Result = { ok: true; message: string } | { ok: false; error: string };

function fail(err: unknown): Result {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** One alias per line or comma-separated, normalised and de-duplicated. */
function parseAliases(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\n,]/)
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export async function upsertCity(input: {
  id?: string;
  name: string;
  slug?: string;
  state?: string | null;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
}): Promise<Result> {
  await requireSession();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required" };

  const slug = slugify(input.slug || name);
  if (!slug) return { ok: false, error: "Could not derive a slug from that name" };

  try {
    const values = {
      name,
      slug,
      state: input.state?.trim() || null,
      country: (input.country || "IN").toUpperCase(),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      isActive: input.isActive ?? true,
    };

    // The unique index is (country, slug); catching it here gives a readable
    // message instead of a raw constraint violation.
    const [clash] = await db
      .select({ id: cities.id })
      .from(cities)
      .where(
        and(
          eq(cities.slug, slug),
          eq(cities.country, values.country),
          input.id ? ne(cities.id, input.id) : undefined,
        ),
      )
      .limit(1);
    if (clash) return { ok: false, error: `A city with slug "${slug}" already exists` };

    if (input.id) await db.update(cities).set(values).where(eq(cities.id, input.id));
    else await db.insert(cities).values(values);

    revalidatePath("/geography");
    return { ok: true, message: input.id ? "City updated" : "City created" };
  } catch (err) {
    return fail(err);
  }
}

export async function upsertLocality(input: {
  id?: string;
  cityId: string;
  name: string;
  slug?: string;
  aliases: string;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
}): Promise<Result> {
  await requireSession();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required" };

  const slug = slugify(input.slug || name);
  if (!slug) return { ok: false, error: "Could not derive a slug from that name" };

  try {
    const [clash] = await db
      .select({ id: localities.id })
      .from(localities)
      .where(
        and(
          eq(localities.cityId, input.cityId),
          eq(localities.slug, slug),
          input.id ? ne(localities.id, input.id) : undefined,
        ),
      )
      .limit(1);
    if (clash) {
      return { ok: false, error: `"${slug}" already exists in this city` };
    }

    const values = {
      cityId: input.cityId,
      name,
      slug,
      aliases: parseAliases(input.aliases),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      isActive: input.isActive ?? true,
    };

    if (input.id) await db.update(localities).set(values).where(eq(localities.id, input.id));
    else await db.insert(localities).values(values);

    revalidatePath("/geography");
    return {
      ok: true,
      message: `${input.id ? "Updated" : "Created"} ${name} (${values.aliases.length} aliases)`,
    };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Deletes a locality, refusing when listings still point at it.
 *
 * Deactivating hides it from filters without orphaning rows, which is almost
 * always what was actually wanted — so say so rather than cascading.
 */
export async function deleteLocality(id: string): Promise<Result> {
  await requireSession();
  try {
    const [{ count: inUse }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(listings)
      .where(eq(listings.localityId, id));

    if (inUse > 0) {
      return {
        ok: false,
        error: `${inUse} listing(s) still reference this locality. Deactivate it instead — that hides it from filters without orphaning them.`,
      };
    }

    await db.delete(localities).where(eq(localities.id, id));
    revalidatePath("/geography");
    return { ok: true, message: "Locality deleted" };
  } catch (err) {
    return fail(err);
  }
}

export async function setLocalityActive(id: string, isActive: boolean): Promise<Result> {
  await requireSession();
  try {
    await db.update(localities).set({ isActive }).where(eq(localities.id, id));
    revalidatePath("/geography");
    return { ok: true, message: isActive ? "Locality enabled" : "Locality hidden" };
  } catch (err) {
    return fail(err);
  }
}

export async function setCityActive(id: string, isActive: boolean): Promise<Result> {
  await requireSession();
  try {
    await db.update(cities).set({ isActive }).where(eq(cities.id, id));
    revalidatePath("/geography");
    return { ok: true, message: isActive ? "City enabled" : "City hidden" };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Adds aliases to an existing locality without replacing the list — the common
 * operation when a caption turns up a spelling nobody had seen.
 */
export async function addAliases(id: string, raw: string): Promise<Result> {
  await requireSession();
  const incoming = parseAliases(raw);
  if (incoming.length === 0) return { ok: false, error: "No aliases given" };

  try {
    const [current] = await db
      .select({ aliases: localities.aliases, name: localities.name })
      .from(localities)
      .where(eq(localities.id, id))
      .limit(1);
    if (!current) return { ok: false, error: "Locality not found" };

    const merged = [...new Set([...current.aliases, ...incoming])];
    const added = merged.length - current.aliases.length;
    await db.update(localities).set({ aliases: merged }).where(eq(localities.id, id));

    revalidatePath("/geography");
    return {
      ok: true,
      message: added === 0 ? "Already present" : `Added ${added} alias(es) to ${current.name}`,
    };
  } catch (err) {
    return fail(err);
  }
}
