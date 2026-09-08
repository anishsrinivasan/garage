import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";

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

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^(.*)\/hyperdrive\.node$/,
        replacement: hyperdriveForWorkers,
      },
    ],
  },
  plugins: [
    vinext({
      cache: { data: kvDataAdapter(), cdn: cdnAdapter() },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
