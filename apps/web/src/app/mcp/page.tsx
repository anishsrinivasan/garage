import type { Metadata } from "next";
import { ProsePage, Section } from "@/app/components/prose-page";
import { SITE_URL } from "@/app/lib/site";

export const metadata: Metadata = {
  title: "MCP endpoint",
  description:
    "Classifieds speaks the Model Context Protocol. Point an agent at /api/mcp and query the Chennai car and rental index directly.",
};

const TOOLS = [
  {
    name: "find_cars",
    summary: "Search preowned cars by make, model, budget, year, fuel, gearbox, body and how recently they were listed.",
  },
  {
    name: "find_rentals",
    summary: "Search rental homes by locality, budget, bedrooms, furnishing, property type and tenant preference.",
  },
  {
    name: "list_localities",
    summary: "The Chennai localities the index actually covers, with how many live listings sit in each.",
  },
  {
    name: "index_status",
    summary: "How many listings are live, how fresh they are, and when the last scrape ran — so an agent can tell stale from empty.",
  },
];

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/[0.06] bg-ink-950/60 p-4 font-mono text-xs leading-relaxed text-ink-300">
      <code>{children}</code>
    </pre>
  );
}

export default function McpPage() {
  return (
    <ProsePage
      eyebrow="For agents"
      title="Query it with MCP, don't scrape it"
      standfirst="Classifieds exposes its index over the Model Context Protocol. An agent can search Chennai cars and rentals directly, with typed arguments and structured results, instead of parsing these pages."
    >
      <Section heading="Connect">
        <p>
          One HTTP endpoint, no key, no token. With Claude Code:
        </p>
        <Code>{`claude mcp add classifieds --transport http ${SITE_URL}/api/mcp`}</Code>
        <p>Or in any client that takes an MCP server config:</p>
        <Code>{`{
  "mcpServers": {
    "classifieds": {
      "type": "http",
      "url": "${SITE_URL}/api/mcp"
    }
  }
}`}</Code>
      </Section>

      <Section heading="Tools">
        <div className="space-y-4">
          {TOOLS.map((tool) => (
            <div key={tool.name}>
              <p className="font-mono text-xs text-accent">{tool.name}</p>
              <p className="mt-1">{tool.summary}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Built for polling">
        <p>
          Both search tools take a <strong>first_seen_after</strong> cursor, so an
          agent can ask only for what has appeared since it last looked. That is the
          intended way to run an alert: poll on your own schedule, keep the
          timestamp, and act on the difference — rather than re-reading the whole
          index and diffing it yourself.
        </p>
      </Section>

      <Section heading="If you would rather not speak MCP">
        <p>
          The same data is available as plain JSON on{" "}
          <a href="/api/listings">/api/listings</a> and{" "}
          <a href="/api/rentals">/api/rentals</a>, with a single listing at
          /api/listing/&lt;id&gt;. There is also an{" "}
          <a href="/llms.txt">llms.txt</a> that describes the index, its filters and
          its freshness in prose, for agents that find the site before they find
          this page.
        </p>
      </Section>

      <Section heading="Fair use">
        <p>
          It is open and unauthenticated for now, which only works while people are
          reasonable about it. Prefer the cursor over repeated full sweeps, and keep
          concurrency modest.
        </p>
      </Section>
    </ProsePage>
  );
}
