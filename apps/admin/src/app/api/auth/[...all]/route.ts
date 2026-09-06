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

export async function POST(request: Request): Promise<Response> {
  return auth.handler(request);
}
