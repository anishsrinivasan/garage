/**
 * Instagram session pool.
 *
 * The scraper used one session file on one box. When it expired, every run
 * failed and nothing said so for fifteen weeks. One session is also one identity
 * to rate-limit — every handle shares it, so adding sources makes challenges
 * arrive sooner, not later.
 *
 * The pool rotates across several sessions, benches one that hits a checkpoint
 * instead of letting it fail every subsequent handle, and falls back to the
 * legacy file so an existing install keeps working with no setup.
 */

import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { db, igSessions } from "@classifieds/db";

/** How long a session sits out after a challenge. Doubles per consecutive failure. */
const BASE_COOLDOWN_MINUTES = 45;
const MAX_COOLDOWN_MINUTES = 12 * 60;

/** Past this, stop retrying and mark it as needing a human to re-authenticate. */
const FAILURES_BEFORE_DISABLE = 4;

export type PooledSession = {
  id: string;
  label: string;
  /** Parsed Playwright storageState. Credential-equivalent — never log it. */
  state: unknown;
};

export type SessionOutcome = "ok" | "challenged" | "error";

/**
 * Picks the least-recently-used session that is active and out of cooldown.
 *
 * Least-recently-used rather than random: it spreads load evenly, which is the
 * whole point of having a pool, and it makes behaviour reproducible when
 * debugging a run.
 */
export async function leaseSession(): Promise<PooledSession | null> {
  const now = new Date();
  // Cooldown is compared with the database's clock, not the process's. Binding
  // a JS Date into a raw fragment also fails to serialise, and a scraper box
  // with a skewed clock should not be able to un-bench a session early.
  const [row] = await db
    .select({
      id: igSessions.id,
      label: igSessions.label,
      state: igSessions.state,
    })
    .from(igSessions)
    .where(
      and(
        eq(igSessions.isActive, true),
        eq(igSessions.status, "active"),
        or(isNull(igSessions.cooldownUntil), sql`${igSessions.cooldownUntil} <= now()`),
      ),
    )
    .orderBy(sql`${igSessions.lastUsedAt} asc nulls first`, asc(igSessions.useCount))
    .limit(1);

  if (!row) return null;

  await db
    .update(igSessions)
    .set({
      lastUsedAt: now,
      useCount: sql`${igSessions.useCount} + 1`,
      updatedAt: now,
    })
    .where(eq(igSessions.id, row.id));

  try {
    return { id: row.id, label: row.label, state: JSON.parse(row.state) };
  } catch {
    // Unparseable state is worse than no state — bench it rather than letting
    // Playwright fail on every handle.
    await reportOutcome(row.id, "error", "stored session state is not valid JSON");
    return null;
  }
}

/**
 * Records how a session fared. Cooldown backs off exponentially, so a session
 * that is genuinely dead stops being tried every run without ever being
 * silently forgotten.
 */
export async function reportOutcome(
  sessionId: string,
  outcome: SessionOutcome,
  error?: string,
): Promise<void> {
  const now = new Date();

  if (outcome === "ok") {
    await db
      .update(igSessions)
      .set({
        consecutiveFailures: 0,
        cooldownUntil: null,
        lastOkAt: now,
        lastError: null,
        status: "active",
        updatedAt: now,
      })
      .where(eq(igSessions.id, sessionId));
    return;
  }

  const [current] = await db
    .select({ failures: igSessions.consecutiveFailures, label: igSessions.label })
    .from(igSessions)
    .where(eq(igSessions.id, sessionId))
    .limit(1);

  const failures = (current?.failures ?? 0) + 1;
  const minutes = Math.min(
    BASE_COOLDOWN_MINUTES * 2 ** (failures - 1),
    MAX_COOLDOWN_MINUTES,
  );
  const exhausted = failures >= FAILURES_BEFORE_DISABLE;

  await db
    .update(igSessions)
    .set({
      consecutiveFailures: failures,
      cooldownUntil: new Date(now.getTime() + minutes * 60_000),
      lastError: error?.slice(0, 500) ?? outcome,
      // "needs_auth" is the signal the admin surfaces: a human must log in
      // again. Distinct from a transient challenge, which cools down and
      // recovers on its own.
      status: exhausted ? "needs_auth" : "active",
      updatedAt: now,
    })
    .where(eq(igSessions.id, sessionId));

  console.warn(
    `[session-pool] ${current?.label ?? sessionId}: ${outcome} (failure ${failures}) — benched for ${minutes}m${exhausted ? ", marked needs_auth" : ""}`,
  );
}

/**
 * Falls back to the legacy single-file session so an existing install keeps
 * working with nothing to set up. Returns null when neither the pool nor the
 * file has anything usable.
 */
export async function leaseSessionOrFile(
  legacyPath: string,
): Promise<PooledSession | null> {
  const pooled = await leaseSession().catch((err) => {
    console.warn(
      `[session-pool] pool unavailable, falling back to file: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  });
  if (pooled) return pooled;

  if (existsSync(legacyPath)) {
    try {
      return {
        id: "legacy-file",
        label: "legacy storage-state.json",
        state: JSON.parse(readFileSync(legacyPath, "utf-8")),
      };
    } catch (err) {
      console.warn(
        `[session-pool] legacy session file is unreadable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return null;
}

/** The legacy file has no pool row, so outcomes for it are a no-op. */
export function isPooled(session: PooledSession): boolean {
  return session.id !== "legacy-file";
}

export type PoolHealth = {
  total: number;
  usable: number;
  cooling: number;
  needsAuth: number;
};

export async function getPoolHealth(): Promise<PoolHealth> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      usable: sql<number>`count(*) filter (where ${igSessions.isActive} and ${igSessions.status} = 'active' and (${igSessions.cooldownUntil} is null or ${igSessions.cooldownUntil} <= now()))::int`,
      cooling: sql<number>`count(*) filter (where ${igSessions.cooldownUntil} > now())::int`,
      needsAuth: sql<number>`count(*) filter (where ${igSessions.status} = 'needs_auth')::int`,
    })
    .from(igSessions);
  return row ?? { total: 0, usable: 0, cooling: 0, needsAuth: 0 };
}
