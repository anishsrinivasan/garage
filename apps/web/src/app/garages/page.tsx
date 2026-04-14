export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Garages & Marketplaces",
  description:
    "Directory of independent garages and aggregator marketplaces we pull preowned car listings from.",
};
import { ArrowUpRight, Building2, MapPin, Store } from "lucide-react";
import { getGarages, type GarageSummary } from "@/app/lib/garages";

export default async function GaragesIndexPage() {
  const all = await getGarages();
  const dealers = all.filter((g) => g.kind === "dealer");
  const marketplaces = all.filter((g) => g.kind === "marketplace");

  return (
    <div>
      <div className="mb-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          Directory
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-gradient sm:text-5xl">
          Garages &amp; Marketplaces
        </h1>
        <p className="mt-3 max-w-xl text-sm text-ink-400">
          Independent dealers we follow and aggregator marketplaces we pull from.
          Each garage can have multiple scrape sources.
        </p>
      </div>

      {dealers.length > 0 && (
        <Section
          title="Independent garages"
          subtitle={`${dealers.length} dealer${dealers.length === 1 ? "" : "s"}`}
          icon={<Store className="h-4 w-4" />}
          garages={dealers}
        />
      )}

      {marketplaces.length > 0 && (
        <Section
          title="Marketplaces"
          subtitle="Aggregator platforms"
          icon={<Building2 className="h-4 w-4" />}
          garages={marketplaces}
        />
      )}

      {all.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center text-sm text-ink-500">
          No garages registered yet.
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon,
  garages,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  garages: GarageSummary[];
}) {
  return (
    <section className="mb-12">
      <div className="mb-5 flex items-end justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent ring-1 ring-inset ring-accent/20">
            {icon}
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-ink-50">{title}</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-500">
              {subtitle}
            </p>
          </div>
        </div>
      </div>
      <div className="grid animate-fade-in-up gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {garages.map((g) => (
          <GarageCard key={g.id} garage={g} />
        ))}
      </div>
    </section>
  );
}

function GarageCard({ garage: g }: { garage: GarageSummary }) {
  return (
    <Link
      href={`/garages/${g.slug}`}
      className="surface surface-hover group relative flex flex-col gap-4 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-ink-200">
            {g.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={g.logoUrl}
                alt={g.name}
                className="h-full w-full rounded-xl object-cover"
              />
            ) : g.kind === "marketplace" ? (
              <Building2 className="h-5 w-5" strokeWidth={1.75} />
            ) : (
              <Store className="h-5 w-5" strokeWidth={1.75} />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold text-ink-50">
              {g.name}
            </h3>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
              {g.kind === "marketplace" ? "Marketplace" : "Dealer"}
            </p>
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-500 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
      </div>

      {g.description && (
        <p className="line-clamp-2 text-sm text-ink-400">{g.description}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
        {g.city && (
          <span className="chip">
            <MapPin className="h-3 w-3" />
            {g.city}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] font-semibold text-ink-200">
          {g.listingCount.toLocaleString("en-IN")}
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-ink-500">
            listings
          </span>
        </span>
      </div>
    </Link>
  );
}
