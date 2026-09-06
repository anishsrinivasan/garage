/**
 * CLI entry point. All the actual work lives in `api.ts` so that a run
 * triggered from the terminal, from the cron service, or from the admin
 * dashboard takes exactly the same path.
 */

import {
  ALL_SOURCES,
  runMaintenance,
  runScrape,
  type SourceName,
} from "./api";

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const source = flag(args, "--source") ?? "all";
  const trigger = flag(args, "--trigger") ?? "cli";
  const handles = flag(args, "--handles")
    ?.split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  if (source === "maintenance") {
    const result = await runMaintenance();
    console.log(
      `[main] maintenance: ${result.delisted} delisted, ${result.demoted} demoted into ${result.clusters} cluster(s)`,
    );
    return;
  }

  const sources: SourceName[] =
    source === "all"
      ? ALL_SOURCES
      : (source.split(",").map((s) => s.trim()) as SourceName[]);

  const unknown = sources.filter((s) => !ALL_SOURCES.includes(s));
  if (unknown.length > 0) {
    console.error(
      `Unknown source(s): ${unknown.join(", ")}. Valid: ${ALL_SOURCES.join(", ")}, maintenance`,
    );
    process.exit(1);
  }

  const summary = await runScrape(sources, { trigger, handles });
  console.log(
    `[main] ran ${summary.adaptersRun} adapter(s) in ${(summary.durationMs / 1000).toFixed(1)}s`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
