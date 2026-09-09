#!/usr/bin/env bun
/**
 * MCP server over the listings index.
 *
 * Deliberately a *reader*, not a crawler. An agent that browses Instagram live,
 * per query, is slow, expensive, and the fastest possible way to get the account
 * banned. This answers from an index that already exists — and that index holds
 * inventory Google does not, which is the entire reason it is interesting.
 *
 * Register with Claude Code:
 *   claude mcp add classifieds --transport http https://<host>/api/mcp
 */


import { z, type ZodRawShape } from "zod";
import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  listings,
  listingCarAttrs,
  listingRentalAttrs,
  localities,
  cities,
  garages,
} from "@classifieds/db";
import { relativeAge, STALE_AFTER_DAYS } from "@classifieds/shared";
import { SITE_URL } from "@/app/lib/site";

/**
 * The listings index, as MCP tools.
 *
 * These lived in a separate stdio app. They are here now because the transport
 * that matters is HTTP — an agent on another host cannot spawn a subprocess on
 * this one — and because the two packages disagreed about zod: the stdio SDK is
 * built on zod 3, @modelcontextprotocol/server on zod 4, and a zod 3 schema
 * handed to `registerTool` is silently ignored. That produced a server that
 * answered `tools/list` with an empty array and no error anywhere. One copy, on
 * one version, in the app that already has the database.
 */
export function registerTools(server: {
  registerTool: (
    name: string,
    config: { description: string; inputSchema: unknown },
    handler: (args: never) => unknown,
  ) => unknown;
}): void {
  const s = {
    tool(name: string, description: string, inputSchema: unknown, handler: unknown) {
      server.registerTool(
        name,
        { description, inputSchema },
        handler as (args: never) => unknown,
      );
    },
  };

/**
 * Parses a polling cursor. Returns null for anything unparseable rather than
 * throwing, so a malformed value degrades to "no cursor" — a caller gets the
 * normal newest-first page instead of an error it cannot act on.
 */
function parseCursor(value: string | undefined): string | null {
  if (!value) return null;
  const at = new Date(value);
  // Returned as an ISO string, not a Date. A Date bound into a query fails to
  // serialise here — "the string argument must be of type string ... received
  // an instance of Date" — the same way it did in the session pool. The cast in
  // the comparison below turns it back into the UTC wall-clock value the
  // timestamp column stores.
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}


/** Shared predicate: what belongs in any answer. */
function liveOnly(vertical: string, includeStale: boolean): SQL[] {
  const conditions: SQL[] = [
    eq(listings.vertical, vertical),
    eq(listings.isActive, true),
    eq(listings.isClusterHead, true),
  ];
  if (!includeStale) {
    conditions.push(
      sql`${listings.lastSeenAt} >= now() - ${`${STALE_AFTER_DAYS} days`}::interval`,
    );
  }
  return conditions;
}

/**
 * Every listing is returned with its age and last-confirmed date.
 *
 * That is the point of this index, and an agent relaying a listing without it
 * would strip out the one thing that makes the answer trustworthy.
 */
function freshnessLine(row: { listedAt: Date | null; firstSeenAt: Date; lastSeenAt: Date }) {
  const listed = relativeAge(row.listedAt ?? row.firstSeenAt);
  const confirmed = relativeAge(row.lastSeenAt);
  const stale =
    Date.now() - row.lastSeenAt.getTime() > STALE_AFTER_DAYS * 86_400_000;
  return `listed ${listed}, last confirmed ${confirmed}${stale ? " — UNCONFIRMED, may be gone" : ""}`;
}

/**
 * The exact value to pass back as `first_seen_after` next time.
 *
 * Without this the polling cursor was unusable: the tool told a caller to send
 * back "the newest first_seen_at you have handled" and then never showed it.
 * A caller had to guess a timestamp, and guessing high skips listings silently.
 */
function cursorLine(row: { firstSeenAt: Date }) {
  return `indexed ${row.firstSeenAt.toISOString()}`;
}

function money(value: number | string | null): string {
  if (value == null) return "on request";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return "on request";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2).replace(/\.?0+$/, "")} L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
  return `₹${n}`;
}

/**
 * Schemas are hoisted and passed through `shape()`.
 *
 * The SDK derives handler argument types from the Zod shape, and with this many
 * optional fields that inference exceeds TypeScript's instantiation-depth limit
 * — `tsc` either errors or takes minutes. Erasing the shape's type at the call
 * boundary and declaring the argument type by hand keeps the checker fast and
 * the handler just as well typed, since the runtime validation is unaffected.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shape = (s: ZodRawShape): any => s;

const findRentalsSchema = {
  locality: z
    .string()
    .optional()
    .describe('Locality name, e.g. "Adyar", "Velachery". Matched against aliases too.'),
  min_rent: z.number().optional().describe("Minimum monthly rent in rupees"),
  max_rent: z.number().optional().describe("Maximum monthly rent in rupees"),
  bhk: z.number().optional().describe("Bedroom count. 4 means four or more."),
  furnishing: z.enum(["unfurnished", "semi_furnished", "fully_furnished"]).optional(),
  posted_within_days: z
    .number()
    .optional()
    .describe(
      "Only homes the broker POSTED within this many days. Not the same as when this index first saw them — for polling, use first_seen_after.",
    ),
  first_seen_after: z
    .string()
    .optional()
    .describe(
      "ISO 8601 timestamp. Returns only listings this index first saw strictly after it, oldest first. This is the parameter to poll on: every result carries an 'indexed <timestamp>' line, so pass back the latest one you have handled and you get exactly what arrived since — nothing missed, nothing repeated.",
    ),
  limit: z.number().min(1).default(50).describe("How many to return. Uncapped — ask for what you need."),
} satisfies ZodRawShape;

type FindRentalsArgs = {
  locality?: string;
  min_rent?: number;
  max_rent?: number;
  bhk?: number;
  furnishing?: "unfurnished" | "semi_furnished" | "fully_furnished";
  posted_within_days?: number;
  first_seen_after?: string;
  limit: number;
};

s.tool(
  "find_rentals",
  "Search rental listings gathered from Instagram brokers. Returns homes with an honest listed date and last-confirmed date — inventory that is largely absent from the big property portals.",
  shape(findRentalsSchema),
  async (raw: unknown) => {
    const args = raw as FindRentalsArgs;
    const conditions = liveOnly("rentals", false);

    if (args.locality) {
      const term = `%${args.locality.toLowerCase()}%`;
      conditions.push(
        or(
          ilike(localities.name, term),
          sql`exists (select 1 from unnest(${localities.aliases}) a where a like ${term})`,
          ilike(listings.location, term),
        )!,
      );
    }
    if (args.min_rent != null) conditions.push(gte(listingRentalAttrs.rent, args.min_rent));
    if (args.max_rent != null) conditions.push(lte(listingRentalAttrs.rent, args.max_rent));
    if (args.bhk != null) {
      conditions.push(
        args.bhk >= 4
          ? gte(listingRentalAttrs.bhk, 4)
          : eq(listingRentalAttrs.bhk, args.bhk),
      );
    }
    if (args.furnishing) {
      conditions.push(eq(listingRentalAttrs.furnishing, args.furnishing));
    }
    if (args.posted_within_days != null) {
      conditions.push(
        sql`coalesce(${listings.listedAt}, ${listings.firstSeenAt}) >= now() - ${`${args.posted_within_days} days`}::interval`,
      );
    }

    // Strictly after, so a caller passing back the last first_seen_at it
    // saw does not receive that same listing again on the next poll.
    const pollingCursor = parseCursor(args.first_seen_after);
    if (pollingCursor) {
      conditions.push(
        sql`${listings.firstSeenAt} > (${pollingCursor})::timestamptz at time zone 'utc'`,
      );
    }

    const rows = await db
      .select({
        id: listings.id,
        listedAt: listings.listedAt,
        firstSeenAt: listings.firstSeenAt,
        lastSeenAt: listings.lastSeenAt,
        city: listings.city,
        locationText: listings.location,
        localityName: localities.name,
        orgName: garages.name,
        phone: listings.sellerPhone,
        bhk: listingRentalAttrs.bhk,
        propertyType: listingRentalAttrs.propertyType,
        rent: listingRentalAttrs.rent,
        deposit: listingRentalAttrs.deposit,
        area: listingRentalAttrs.carpetAreaSqft,
        furnishing: listingRentalAttrs.furnishing,
        tenantPreference: listingRentalAttrs.tenantPreference,
      })
      .from(listings)
      .innerJoin(listingRentalAttrs, eq(listingRentalAttrs.listingId, listings.id))
      .leftJoin(localities, eq(localities.id, listings.localityId))
      .leftJoin(garages, eq(garages.id, listings.garageId))
      .where(and(...conditions))
      // Polling reads oldest-first: a caller that fills `limit` can move its
      // cursor to the last row and continue without skipping what came between.
      .orderBy(
        ...(pollingCursor
          ? [asc(listings.firstSeenAt), asc(listings.id)]
          : [
              desc(sql`coalesce(${listings.listedAt}, ${listings.firstSeenAt})`),
              desc(listings.id),
            ]),
      )
      .limit(args.limit);

    if (rows.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No rentals match. The index currently covers Chennai only; try widening the rent range or dropping the locality filter.",
          },
        ],
      };
    }

    const lines = rows.map((r) => {
      const where = r.localityName ?? r.locationText ?? r.city;
      const layout = r.bhk != null ? `${r.bhk} BHK` : (r.propertyType ?? "home");
      return [
        `${layout} in ${where} — ${money(r.rent)}/month`,
        `  deposit ${money(r.deposit)}${r.area ? `, ${r.area} sqft` : ""}${r.furnishing ? `, ${r.furnishing.replace(/_/g, " ")}` : ""}`,
        `  ${freshnessLine(r)}`,
        `  ${cursorLine(r)}`,
        `  broker: ${r.orgName ?? "unknown"}${r.phone ? ` (${r.phone})` : ""}`,
        `  ${SITE_URL}/rent/${r.id}`,
      ].join("\n");
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `${rows.length} rental(s):\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  },
);

const findCarsSchema = {
  query: z.string().optional().describe('Free text, e.g. "BMW X5", "Creta"'),
  make: z.string().optional(),
  min_price: z.number().optional().describe("Minimum asking price in rupees"),
  max_price: z.number().optional().describe("Maximum asking price in rupees"),
  min_year: z.number().optional(),
  fuel_type: z.enum(["petrol", "diesel", "cng", "electric", "hybrid", "lpg"]).optional(),
  body_type: z.string().optional(),
  first_seen_after: z
    .string()
    .optional()
    .describe(
      "ISO 8601 timestamp. Returns only listings this index first saw strictly after it, oldest first. Every result carries an 'indexed <timestamp>' line; pass back the latest one you have handled.",
    ),
  limit: z.number().min(1).default(50).describe("How many to return. Uncapped — ask for what you need."),
} satisfies ZodRawShape;

type FindCarsArgs = {
  query?: string;
  make?: string;
  min_price?: number;
  max_price?: number;
  min_year?: number;
  fuel_type?: string;
  body_type?: string;
  first_seen_after?: string;
  limit: number;
};

s.tool(
  "find_cars",
  "Search used-car listings gathered from Instagram dealers and marketplaces, with an honest listed date and last-confirmed date.",
  shape(findCarsSchema),
  async (raw: unknown) => {
    const args = raw as FindCarsArgs;
    const conditions = liveOnly("cars", false);

    if (args.query) {
      const term = `%${args.query}%`;
      conditions.push(
        or(
          ilike(listingCarAttrs.make, term),
          ilike(listingCarAttrs.model, term),
          ilike(listingCarAttrs.variant, term),
        )!,
      );
    }
    if (args.make) conditions.push(ilike(listingCarAttrs.make, `%${args.make}%`));
    if (args.min_price != null) conditions.push(gte(listings.price, String(args.min_price)));
    if (args.max_price != null) conditions.push(lte(listings.price, String(args.max_price)));
    if (args.min_year != null) conditions.push(gte(listingCarAttrs.year, args.min_year));
    if (args.fuel_type) conditions.push(eq(listingCarAttrs.fuelType, args.fuel_type));
    if (args.body_type) conditions.push(eq(listingCarAttrs.bodyType, args.body_type));

    // Strictly after, so a caller passing back the last first_seen_at it saw
    // does not receive that same listing again on the next poll.
    const pollingCursor = parseCursor(args.first_seen_after);
    if (pollingCursor) {
      conditions.push(
        sql`${listings.firstSeenAt} > (${pollingCursor})::timestamptz at time zone 'utc'`,
      );
    }

    const rows = await db
      .select({
        id: listings.id,
        listedAt: listings.listedAt,
        firstSeenAt: listings.firstSeenAt,
        lastSeenAt: listings.lastSeenAt,
        price: listings.price,
        city: listings.city,
        sourcePlatform: listings.sourcePlatform,
        orgName: garages.name,
        make: listingCarAttrs.make,
        model: listingCarAttrs.model,
        variant: listingCarAttrs.variant,
        year: listingCarAttrs.year,
        kmDriven: listingCarAttrs.kmDriven,
        fuelType: listingCarAttrs.fuelType,
        transmission: listingCarAttrs.transmission,
      })
      .from(listings)
      .innerJoin(listingCarAttrs, eq(listingCarAttrs.listingId, listings.id))
      .leftJoin(garages, eq(garages.id, listings.garageId))
      .where(and(...conditions))
      // Polling reads oldest-first: a caller that fills `limit` can move its
      // cursor to the last row and continue without skipping what came between.
      .orderBy(
        ...(pollingCursor
          ? [asc(listings.firstSeenAt), asc(listings.id)]
          : [
              desc(sql`coalesce(${listings.listedAt}, ${listings.firstSeenAt})`),
              desc(listings.id),
            ]),
      )
      .limit(args.limit);

    if (rows.length === 0) {
      return {
        content: [
          { type: "text" as const, text: "No cars match those criteria." },
        ],
      };
    }

    const lines = rows.map((r) =>
      [
        `${r.year} ${r.make} ${r.model}${r.variant ? ` ${r.variant}` : ""} — ${money(r.price)}`,
        `  ${r.kmDriven ? `${r.kmDriven.toLocaleString("en-IN")} km` : "km unknown"}${r.fuelType ? `, ${r.fuelType}` : ""}${r.transmission ? `, ${r.transmission}` : ""}, ${r.city}`,
        `  ${freshnessLine(r)}`,
        `  ${cursorLine(r)}`,
        `  seller: ${r.orgName ?? r.sourcePlatform}`,
        `  ${SITE_URL}/listings/${r.id}`,
      ].join("\n"),
    );

    return {
      content: [
        { type: "text" as const, text: `${rows.length} car(s):\n\n${lines.join("\n\n")}` },
      ],
    };
  },
);

const listLocalitiesSchema = {
  city: z.string().default("chennai").describe("City slug, e.g. chennai"),
  min_listings: z.number().default(1),
} satisfies ZodRawShape;

s.tool(
  "list_localities",
  "List the localities the index covers, with how many live listings each has. Use this to discover valid locality names before searching.",
  shape(listLocalitiesSchema),
  async (raw: unknown) => {
    const args = raw as { city: string; min_listings: number };
    const rows = await db
      .select({
        name: localities.name,
        total: sql<number>`count(${listings.id})::int`,
      })
      .from(localities)
      .innerJoin(cities, eq(cities.id, localities.cityId))
      .leftJoin(
        listings,
        and(
          eq(listings.localityId, localities.id),
          eq(listings.isActive, true),
          eq(listings.isClusterHead, true),
        ),
      )
      .where(eq(cities.slug, args.city.toLowerCase()))
      .groupBy(localities.id, localities.name)
      .having(sql`count(${listings.id}) >= ${args.min_listings}`)
      .orderBy(desc(sql`count(${listings.id})`), asc(localities.name));

    if (rows.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No localities in "${args.city}" have at least ${args.min_listings} live listing(s) yet.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: rows.map((r) => `${r.name} (${r.total})`).join("\n"),
        },
      ],
    };
  },
);

s.tool(
  "index_status",
  "What this index currently covers: listing counts per vertical, freshness, and when it was last updated. Use this to judge whether an empty result means 'nothing matches' or 'nothing indexed yet'.",
  shape({}),
  async () => {
    const rows = await db
      .select({
        vertical: listings.vertical,
        live: sql<number>`count(*) filter (where ${listings.isActive} and ${listings.isClusterHead})::int`,
        addedWeek: sql<number>`count(*) filter (where ${listings.firstSeenAt} >= now() - interval '7 days')::int`,
        stale: sql<number>`count(*) filter (where ${listings.isActive} and ${listings.lastSeenAt} < now() - ${`${STALE_AFTER_DAYS} days`}::interval)::int`,
        newest: sql<Date | null>`max(${listings.firstSeenAt})`,
      })
      .from(listings)
      .groupBy(listings.vertical);

    const text = rows
      .map(
        (r) =>
          `${r.vertical}: ${r.live} live, ${r.addedWeek} added this week, ${r.stale} unconfirmed. Newest ${relativeAge(r.newest) ?? "unknown"}.`,
      )
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `${text}\n\nCoverage: Chennai. Every listing carries a listed date and a last-confirmed date; anything past ${STALE_AFTER_DAYS} days without confirmation is flagged unconfirmed.`,
        },
      ],
    };
  },
);

}
