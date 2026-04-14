import {
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { torqueSchema } from "./_schema";

export const llmUsageLogs = torqueSchema.table(
  "llm_usage_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    operation: text("operation").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    totalTokens: integer("total_tokens"),
    latencyMs: integer("latency_ms"),
    success: boolean("success").notNull().default(true),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    idxCreatedAt: index("idx_llm_logs_created_at").on(table.createdAt),
    idxOperation: index("idx_llm_logs_operation").on(table.operation),
    idxModel: index("idx_llm_logs_model").on(table.model),
  }),
);
