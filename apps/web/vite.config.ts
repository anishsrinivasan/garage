import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

/**
 * On Workers the database is reached through Hyperdrive, not a direct
 * connection. @classifieds/db imports the no-op `hyperdrive.node` module; this
 * alias swaps in the Workers implementation for this build only, so the
 * `cloudflare:workers` import never reaches the scraper or cron bundles, where
 * it does not resolve.
 */
const hyperdriveForWorkers = fileURLToPath(
  new URL("../../packages/db/src/hyperdrive.workerd.ts", import.meta.url),
);

/**
 * The Node client keeps one connection for the life of the process; a Worker
 * isolate serves many requests from one module instance, and reusing a socket
 * across them is exactly what the runtime forbids. The Workers build gets a
 * per-request client instead.
 */
const dbClientForWorkers = fileURLToPath(
  new URL("../../packages/db/src/client.workerd.ts", import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^(.*)\/hyperdrive\.node$/,
        replacement: hyperdriveForWorkers,
      },
      {
        find: /^(.*)\/client\.node$/,
        replacement: dbClientForWorkers,
      },
    ],
  },
  plugins: [
    // No data or CDN cache adapter: every request goes to the database. A
    // cached entry on Workers is refreshed behind the response using the
    // connection the request opened, which the runtime rejects.
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
