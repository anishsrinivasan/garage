import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, users, sessions, accounts, verifications } from "@classifieds/db";

/**
 * Admin authentication.
 *
 * Email + password only, and deliberately no public sign-up: this dashboard can
 * edit prices, delist listings and trigger scrapes, so accounts are created out
 * of band with `bun run apps/admin/scripts/create-user.ts`.
 *
 * The tables live in the shared `torque` schema alongside everything else; the
 * public web app never reads them.
 */
function requireSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET must be set — without it sessions are signed with a predictable key",
    );
  }
  console.warn("[auth] BETTER_AUTH_SECRET unset; using a dev-only fallback");
  return "dev-only-insecure-secret-change-me";
}

function createAuth() {
  return betterAuth({
    secret: requireSecret(),
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // No verification mail is wired up, and there is no sign-up to verify.
      requireEmailVerification: false,
      minPasswordLength: 12,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      // The dashboard is served from its own host; nothing cross-site needs it.
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | null = null;

/**
 * Built on first use, not at import.
 *
 * better-auth's Drizzle adapter probes the database as it is constructed, so
 * building this at module scope made `next build` fail while merely collecting
 * page data for the auth route — the app could not be built without production
 * credentials to hand. Deferring construction keeps builds credential-free
 * while every real request still gets a fully configured instance.
 */
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, property, receiver) {
    instance ??= createAuth();
    return Reflect.get(instance, property, receiver);
  },
});

export type Session = Auth["$Infer"]["Session"];
