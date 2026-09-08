import { uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";

export const feedback = appSchema.table("feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: text("category").notNull(),
  rating: integer("rating"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
