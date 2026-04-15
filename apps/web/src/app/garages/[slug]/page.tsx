export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  MapPin,
  Phone,
  Radio,
  Store,
} from "lucide-react";
import {
  getGarageBySlug,
  getGarageSources,
  getListingsForGarage,
} from "@/app/lib/garages";
import { ListingCard } from "@/app/components/listing-card";
import { SourceBadge } from "@/app/components/source-badge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const garage = await getGarageBySlug(slug);
  if (!garage) return { title: "Garage not found" };
  const description =
    garage.description ??
    `Preowned car listings from ${garage.name}${garage.city ? " in " + garage.city : ""}.`;
  return {
    title: garage.name,
    description,
    openGraph: {
      title: garage.name,
      description,
      type: "profile",
      images: garage.logoUrl ? [{ url: garage.logoUrl }] : undefined,
    },
  };
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

const SOURCE_TYPE_LABEL: Record<string, string> = {
  instagram_dealer: "Instagram",
  marketplace_aggregator: "Marketplace feed",
  dealer_website: "Website",
  other: "Other",
};

export default async function GaragePage({ params }: PageProps) {
  const { slug } = await params;
  const garage = await getGarageBySlug(slug);
  if (!garage) notFound();

  const [listings, sources] = await Promise.all([
    getListingsForGarage(garage.id),
    getGarageSources(garage.id),
  ]);

  const isMarketplace = garage.kind === "marketplace";

  return (
    <div className="animate-fade-in-up">
      <Link
        href="/garages"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-50"
      >
        <ArrowLeft className="h-4 w-4" />
        All garages
      </Link>

      <section className="surface relative mb-10 overflow-hidden rounded-2xl p-6 sm:p-8">
        <div className="pointer-events-none absolute -top-24 right-0 -z-10 h-[300px] w-[300px] rounded-full bg-accent/10 blur-[120px]" />

        <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-start">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-ink-200">
            {garage.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={garage.logoUrl}
                alt={garage.name}
                className="h-full w-full rounded-2xl object-cover"
              />
            ) : isMarketplace ? (
              <Building2 className="h-7 w-7" strokeWidth={1.6} />
            ) : (
              <Store className="h-7 w-7" strokeWidth={1.6} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">
                {isMarketplace ? (
                  <Building2 className="h-3 w-3" />
                ) : (
                  <Store className="h-3 w-3" />
                )}
                {isMarketplace ? "Marketplace" : "Independent garage"}
              </span>
              {garage.city && (
                <span className="chip">
                  <MapPin className="h-3 w-3" />
                  {garage.city}
                </span>
              )}
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink-50 sm:text-4xl">
              {garage.name}
            </h1>
            {garage.description && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-300">
                {garage.description}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {garage.websiteUrl && (
                <a
                  href={garage.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Website
                </a>
              )}
              {garage.instagramUrl && (
                <a
                  href={garage.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Instagram
                </a>
              )}
              {garage.phone && (
                <a href={`tel:${garage.phone}`} className="btn-ghost">
                  <Phone className="h-3.5 w-3.5" />
                  {garage.phone}
                </a>
              )}
            </div>
          </div>

          <div className="w-fit rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-left sm:ml-auto sm:text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500">
              Active listings
            </p>
            <p className="font-display text-3xl font-bold text-ink-50">
              {listings.length}
            </p>
          </div>
        </div>
      </section>

      {sources.length > 0 && (
        <section className="surface mb-10 rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <Radio className="h-4 w-4 text-accent" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink-200">
              Scrape sources
            </h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {sources.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5"
              >
                <SourceBadge platform={s.platform} />
                <span className="text-xs text-ink-300">@{s.handle}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">
                  {SOURCE_TYPE_LABEL[s.sourceType] ?? s.sourceType}
                </span>
                {!s.isActive && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">
                    Paused
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mb-5 flex items-end justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight text-ink-50">
          Latest listings
        </h2>
      </div>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center text-sm text-ink-500">
          No active listings yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing as any} />
          ))}
        </div>
      )}
    </div>
  );
}
