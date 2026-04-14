import { defineConfig } from "drizzle-kit";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

if (!process.env.DATABASE_URL) {
  const envPath = resolve(__dirname, "../../.env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        )
          val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

// Migrations always need a session-mode connection (DDL doesn't survive
// transaction-pooled sessions). DATABASE_DIRECT_URL takes precedence when set;
// fall back to DATABASE_URL for local dev where they're often the same.
const migrationUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!;

export default defineConfig({
  schema: resolve(__dirname, "src/schema/index.ts"),
  out: resolve(__dirname, "drizzle"),
  dialect: "postgresql",
  schemaFilter: ["torque"],
  dbCredentials: {
    url: migrationUrl,
  },
});
