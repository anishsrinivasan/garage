import { auth } from "@/lib/auth";

// better-auth hashes passwords and talks to Postgres; neither works on edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Handlers are thin wrappers rather than `toNextJsHandler(auth.handler)`
 * because that form reads `auth.handler` at module scope, which builds the
 * better-auth instance — and therefore probes the database — during
 * `next build`'s page-data collection. Deferring the access to request time
 * keeps the build free of database credentials.
 */
export async function GET(request: Request): Promise<Response> {
  return auth.handler(request);
}

/**
 * Sign-up is closed over HTTP.
 *
 * better-auth enables `POST /api/auth/sign-up/email` whenever email+password is
 * on, so this dashboard — which can edit prices, delist listings and trigger
 * scrapes — would hand an admin account to anyone who posted an email and a
 * password to it. It did: a probe against a fresh install came back `200` with a
 * session token.
 *
 * Blocked here rather than with `emailAndPassword.disableSignUp` because
 * `scripts/create-user.ts` calls `auth.api.signUpEmail` in-process, and that
 * option would refuse the legitimate out-of-band path too. The script never
 * touches this handler, so closing the route leaves it working.
 */
function isSignUp(request: Request): boolean {
  return new URL(request.url).pathname.includes("/sign-up");
}

export async function POST(request: Request): Promise<Response> {
  if (isSignUp(request)) {
    return Response.json(
      { message: "Sign-up is disabled. Accounts are created by an administrator." },
      { status: 403 },
    );
  }
  return auth.handler(request);
}
