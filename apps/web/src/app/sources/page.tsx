/**
 * Rendered per request. Nothing here is cached across requests.
 */
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { AtSign, Building2, Home, MapPin, Store } from "lucide-react";
import { getSources, type SourceSummary } from "@/app/lib/sources";
import { relativeAge } from "@/app/lib/format";

export const metadata: Metadata = {
  title: "Sources",
  description:
    "Every dealer, broker and marketplace behind the listings — with their inventory in one place.",
};

export default async function SourcesPage() {
  const all = await getSources();

  // Grouped by what someone is looking for, not by the `kind` column. A renter
  // wants the brokers; a buyer wants the garages; nobody wants a list sorted by
  // an internal enum.
  const carDealers = all.filter((s) => s.vertical === "cars" && s.kind !== "marketplace");
  const brokers = all.filter((s) => s.vertical === "rentals");
  const marketplaces = all.filter((s) => s.kind === "marketplace");

  const withStock = all.filter((s) => s.listingCount > 0).length;

  return (
    <div className="animate-fade-in-up">
      <div className="mb-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          Directory
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-gradient sm:text-5xl">
          Where the listings come from
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-400">
          Every car dealer, rental broker and marketplace in the index. Open one to
          browse everything they have listed, or go straight to their Instagram.{" "}
          {withStock} of {all.length} have live inventory right now.
        </p>
      </div>

      <Section
        title="Rental brokers"
        subtitle={`${brokers.length} on Instagram`}
        icon={<Home className="h-4 w-4" />}
        sources={brokers}
      />
      <Section
        title="Car dealers"
        subtitle={`${carDealers.length} independent`}
        icon={<Store className="h-4 w-4" />}
        sources={carDealers}
      />
      <Section
        title="Marketplaces"
        subtitle="Aggregator platforms"
        icon={<Building2 className="h-4 w-4" />}
        sources={marketplaces}
      />
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon,
  sources,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  sources: SourceSummary[];
}) {
  if (sources.length === 0) return null;

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink-100">
          <span className="text-ink-500">{icon}</span>
          {title}
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-600">
          {subtitle}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sources.map((source) => (
          <SourceCard key={source.id} source={source} />
        ))}
      </div>
    </section>
  );
}

function SourceCard({ source }: { source: SourceSummary }) {
  const handle = source.handles[0];
  const isMarketplace = source.kind === "marketplace";

  return (
    <Link
      href={`/sources/${source.slug}`}
      className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.04]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-ink-400">
        {source.logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={source.logoUrl} alt="" className="h-full w-full object-cover" />
        ) : isMarketplace ? (
          <Building2 className="h-5 w-5" strokeWidth={1.6} />
        ) : source.vertical === "rentals" ? (
          <Home className="h-5 w-5" strokeWidth={1.6} />
        ) : (
          <Store className="h-5 w-5" strokeWidth={1.6} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold text-ink-100">
          {source.name}
        </p>
        {handle && (
          <p className="mt-0.5 flex items-center gap-1 truncate font-mono text-[11px] text-ink-500">
            <AtSign className="h-3 w-3 shrink-0" />{handle}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
          <span className="font-mono text-ink-300">
            {source.listingCount}{" "}
            <span className="text-ink-600">
              {source.vertical === "rentals" ? "home" : "car"}
              {source.listingCount === 1 ? "" : "s"}
            </span>
          </span>
          {source.city && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />
              {source.city}
            </span>
          )}
          {/* Says plainly when a source has gone quiet, rather than leaving an
              empty page to explain itself. */}
          {source.lastListedAt && (
            <span className="text-ink-600">{relativeAge(source.lastListedAt)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
