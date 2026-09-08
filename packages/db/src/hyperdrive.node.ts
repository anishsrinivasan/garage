/**
 * Hyperdrive is a Cloudflare Workers binding, so off Workers there is nothing
 * to read and the caller falls back to DATABASE_URL. The `workerd` export
 * condition in package.json swaps this for the Workers implementation, which
 * keeps `cloudflare:workers` out of every Node and Bun bundle — importing it
 * there fails to resolve.
 */
export function hyperdriveConnectionString(): string | null {
  return null;
}
