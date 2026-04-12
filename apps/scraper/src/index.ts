import { createInstagramAdapter } from "./adapters/instagram";
import { createCars24Adapter } from "./adapters/cars24";
import { runAdapter } from "./runner";

const SOURCE_FLAG = "--source";

async function main() {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf(SOURCE_FLAG);
  const source = sourceIdx !== -1 ? args[sourceIdx + 1] : "all";

  const adapters = [];

  if (source === "instagram" || source === "all") {
    adapters.push(createInstagramAdapter());
  }

  if (source === "cars24" || source === "all") {
    adapters.push(createCars24Adapter());
  }

  if (adapters.length === 0) {
    console.error(`Unknown source: ${source}`);
    process.exit(1);
  }

  for (const adapter of adapters) {
    await runAdapter(adapter);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
