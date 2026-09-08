/**
 * Imports a Playwright storage-state file into the session pool.
 *
 *   bun run apps/scraper/src/session-import.ts <label> [path]
 *
 * Generate the file first with `bun run apps/scraper/src/instagram-login.ts`,
 * logging in as the account you want to add, then import it under a label.
 * Run this once per account — the whole point of the pool is more than one.
 *
 * The state is credential-equivalent: anyone holding it can act as that
 * Instagram account. It goes straight into the database and is never printed.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db, igSessions } from "@preowned-cars/db";

const DEFAULT_PATH = resolve(
  process.cwd(),
  "apps",
  "scraper",
  ".session",
  "storage-state.json",
);

async function main() {
  const [label, pathArg] = process.argv.slice(2);
  if (!label) {
    console.error(
      "Usage: bun run apps/scraper/src/session-import.ts <label> [path-to-storage-state.json]\n" +
        "  label  a name for this account, e.g. the handle it belongs to",
    );
    process.exit(1);
  }

  const path = pathArg ? resolve(pathArg) : DEFAULT_PATH;
  if (!existsSync(path)) {
    console.error(
      `No storage state at ${path}\nRun: bun run apps/scraper/src/instagram-login.ts`,
    );
    process.exit(1);
  }

  let state: unknown;
  const raw = readFileSync(path, "utf-8");
  try {
    state = JSON.parse(raw);
  } catch {
    console.error(`${path} is not valid JSON.`);
    process.exit(1);
  }

  // A storage state with no cookies is a logged-out session; importing it would
  // put a guaranteed-failing identity into the rotation.
  const cookies = (state as { cookies?: unknown[] })?.cookies ?? [];
  if (!Array.isArray(cookies) || cookies.length === 0) {
    console.error(
      "That file has no cookies — it is a logged-out session. Log in first, then export.",
    );
    process.exit(1);
  }
  const hasAuth = cookies.some(
    (c) => typeof c === "object" && c !== null && (c as { name?: string }).name === "sessionid",
  );
  if (!hasAuth) {
    console.warn(
      "Warning: no `sessionid` cookie found. This may be a logged-out session.",
    );
  }

  const [existing] = await db
    .select({ id: igSessions.id })
    .from(igSessions)
    .where(eq(igSessions.label, label))
    .limit(1);

  const now = new Date();
  if (existing) {
    await db
      .update(igSessions)
      .set({
        state: raw,
        // Re-importing is how a human clears a needs_auth session.
        status: "active",
        isActive: true,
        cooldownUntil: null,
        consecutiveFailures: 0,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(igSessions.id, existing.id));
    console.log(`Updated session "${label}" (${cookies.length} cookies) and cleared its cooldown.`);
  } else {
    await db.insert(igSessions).values({ label, state: raw });
    console.log(`Added session "${label}" (${cookies.length} cookies) to the pool.`);
  }

  const all = await db
    .select({
      label: igSessions.label,
      status: igSessions.status,
      cooldownUntil: igSessions.cooldownUntil,
    })
    .from(igSessions);
  console.log(`\nPool now has ${all.length} session(s):`);
  for (const s of all) {
    const cooling = s.cooldownUntil && s.cooldownUntil > now ? ` (cooling until ${s.cooldownUntil.toISOString()})` : "";
    console.log(`  ${s.label} — ${s.status}${cooling}`);
  }
  process.exit(0);
}

void main();
