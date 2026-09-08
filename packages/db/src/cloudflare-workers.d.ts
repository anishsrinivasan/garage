/**
 * Minimal ambient declaration for the Workers runtime module.
 *
 * Declared here rather than pulling in @cloudflare/workers-types: this package
 * is shared with Node and Bun processes that have no business carrying Workers
 * globals, and the Hyperdrive binding is the only member we touch.
 */
declare module "cloudflare:workers" {
  export const env: {
    HYPERDRIVE?: { connectionString?: string };
  } & Record<string, unknown>;
}
