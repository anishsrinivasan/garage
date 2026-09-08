/**
 * The listings index over HTTP, as MCP.
 *
 * An agent on another host cannot spawn a subprocess on this one, so the stdio
 * transport the index started with was never going to serve one. Over HTTP an
 * agent needs a URL and nothing else — no database credentials, which is a much
 * narrower grant than handing out DATABASE_URL just to read listings.
 *
 * It is a route in this app rather than a service of its own because the app
 * already has the database connection, the deployment and the domain. A second
 * app would have meant a second copy of every query.
 */
import { createMcpHandler } from "mcp-handler";
import { registerTools } from "./tools";

export const dynamic = "force-dynamic";

const handler = createMcpHandler((server) => {
  registerTools(server as never);
});

/**
 * Open, and unmetered.
 *
 * The index is public data — the same listings the site serves to anyone — and
 * `limit` is uncapped because the caller is an agent that knows what it is
 * asking for. If this is ever pointed at the open internet, put Cloudflare
 * Access or a WAF rate-limit rule in front of the route and reinstate a ceiling
 * on `limit`; one unbounded call is a full table read.
 */
export { handler as GET, handler as POST, handler as DELETE };
