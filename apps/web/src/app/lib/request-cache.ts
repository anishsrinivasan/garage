/**
 * `unstable_cache`, except on Cloudflare Workers.
 *
 * Workers forbid touching an I/O object created in another request's context.
 * `unstable_cache` revalidates in the background *after* the response has been
 * sent, and does it with the database connection the original request opened —
 * so on a stale entry the revalidation throws
 *
 *   Cannot perform I/O on behalf of a different request
 *
 * the promise never settles, and the runtime eventually kills the invocation
 * with "your Worker's code had hung and would never generate a response". What
 * the visitor sees is a page stuck on its loading skeleton, or the error
 * boundary on a detail page.
 *
 * On Workers we therefore run the loader directly. These queries are already
 * memoised for the life of a single render by React's `cache`, so a page pays
 * for them once per request rather than once per call. Node keeps the real
 * `unstable_cache`, so nothing changes on Vercel.
 */
import { cache } from "react";
import { unstable_cache } from "next/cache";

const onWorkers =
  typeof navigator !== "undefined" &&
  navigator.userAgent === "Cloudflare-Workers";

export function cachedQuery<T>(
  loader: () => Promise<T>,
  keyParts: string[],
  options: { tags?: string[]; revalidate?: number },
): () => Promise<T> {
  if (onWorkers) return cache(loader);
  return unstable_cache(loader, keyParts, options);
}
