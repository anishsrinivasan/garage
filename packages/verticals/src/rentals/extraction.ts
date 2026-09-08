import { z } from "zod";

/**
 * What the model returns per rental post.
 *
 * Every field is nullable on purpose. A broker caption that omits the deposit is
 * normal; a schema that forces a number invites the model to invent one, and an
 * invented deposit is worse than a missing one.
 */
export const RentalPostSchema = z.object({
  index: z.number().int().positive(),

  isRentalListing: z.boolean(),
  isRented: z.boolean(),

  bhk: z.number().int().min(0).max(20).nullable(),
  propertyType: z
    .enum(["apartment", "independent_house", "villa", "studio", "rk", "pg", "commercial"])
    .nullable(),
  carpetAreaSqft: z.number().int().nullable(),
  floor: z.number().int().nullable(),
  totalFloors: z.number().int().nullable(),

  rent: z.number().nullable(),
  deposit: z.number().nullable(),
  maintenance: z.number().nullable(),
  maintenanceIncluded: z.boolean().nullable(),

  furnishing: z.enum(["unfurnished", "semi_furnished", "fully_furnished"]).nullable(),
  tenantPreference: z
    .enum(["family", "bachelors", "bachelors_male", "bachelors_female", "company", "any"])
    .nullable(),
  parking: z.enum(["none", "bike", "car", "both"]).nullable(),
  availableFrom: z.string().nullable(),
  amenities: z.array(z.string()).default([]),

  /** Copied verbatim from the caption; resolved to a locality later. */
  locationText: z.string().nullable(),
  contactPhone: z.string().nullable(),
});

export type RentalExtraction = z.infer<typeof RentalPostSchema>;

export const RentalBatchSchema = z.object({
  posts: z.array(RentalPostSchema),
});
