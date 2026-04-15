import { uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { torqueSchema } from "./_schema";

export const feedback = torqueSchema.table("feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: text("category").notNull(),
  rating: integer("rating"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
