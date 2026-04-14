import { pgSchema } from "drizzle-orm/pg-core";

/**
 * All Torque tables live in the `torque` schema so that the underlying
 * PlanetScale Postgres database can host multiple side projects without
 * table-name collisions.
 *
 * To add a new project on the same cluster: create another schema row in
 * Postgres (e.g. `other_app`), define its tables under `pgSchema("other_app")`,
 * and point the app's connection string at a role scoped to that schema.
 */
export const torqueSchema = pgSchema("torque");
