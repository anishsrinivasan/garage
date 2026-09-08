import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

/**
 * Same two swaps the public app makes for the Workers build.
 *
 * The Node database client keeps one connection for the life of the process. A
 * Worker isolate serves many requests from one module instance, and touching a
 * socket opened by an earlier request is exactly what the runtime forbids —
 * "Cannot perform I/O on behalf of a different request", after which the
 * invocation is killed for hanging. The Workers client builds a connection per
 * request instead, through Hyperdrive.
 */
const hyperdriveForWorkers = fileURLToPath(
  new URL("../../packages/db/src/hyperdrive.workerd.ts", import.meta.url),
);
const dbClientForWorkers = fileURLToPath(
  new URL("../../packages/db/src/client.workerd.ts", import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^(.*)\/hyperdrive\.node$/, replacement: hyperdriveForWorkers },
      { find: /^(.*)\/client\.node$/, replacement: dbClientForWorkers },
    ],
  },
  plugins: [
    // No cache adapters. Every request asks the database; a cached entry is
    // refreshed behind the response using the connection that request opened,
    // which the runtime rejects. The dashboard wants live data anyway.
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
