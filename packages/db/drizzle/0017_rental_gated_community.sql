-- Gated community as a first-class rental attribute.
--
-- The signal was already in the captions and nowhere else: eleven listings say
-- "gated community" in their description, and the amenities array — which does
-- carry security, lift, gym and clubhouse — had not one entry for it.
--
-- Nullable, and left null by this migration: "not mentioned" is not the same
-- claim as "not gated", and most captions are silent. Backfilling from the
-- caption text is a separate, reversible step.
ALTER TABLE "torque"."listing_rental_attrs"
  ADD COLUMN IF NOT EXISTS "gated_community" boolean;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rental_attrs_gated"
  ON "torque"."listing_rental_attrs" ("gated_community");
