/**
 * One source, and everything it has listed.
 *
 * Vertical-aware where the garages page it replaces was not: a rental broker
 * gets rental cards, a car dealer gets car cards, and the copy stops calling
 * every source a "garage".
 */
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  ExternalLink,
  Home,
  MapPin,
  Phone,
  Store,
} from "lucide-react";
import {
  getSourceBySlug,
  getCarsForSource,
  getRentalsForSource,
} from "@/app/lib/sources";
import { getGarageSources } from "@/app/lib/garages";
import { relativeAge } from "@/app/lib/format";
import { SourceListings } from "./source-listings";
import type { CardListing } from "@/app/components/listing-card";
import type { RentalCardListing } from "@/app/components/rental-card";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const source = await getSourceBySlug(slug);
  if (!source) return { title: "Source not found" };

  const what = source.vertical === "rentals" ? "Rental listings" : "Preowned cars";
  return {
    title: source.name,
    description: `${what} from ${source.name}${source.city ? ` in ${source.city}` : ""}, with the date each was posted.`,
  };
}

export default async function SourcePage({ params }: PageProps) {
  const { slug } = await params;
  const source = await getSourceBySlug(slug);
  if (!source) notFound();

  const isRentals = source.vertical === "rentals";
  const isMarketplace = source.kind === "marketplace";

  const [cars, rentals, handles] = await Promise.all([
    isRentals ? Promise.resolve([]) : getCarsForSource(source.id),
    isRentals ? getRentalsForSource(source.id) : Promise.resolve([]),
    getGarageSources(source.id),
  ]);

  const count = isRentals ? rentals.length : cars.length;
  const newest = isRentals
    ? (rentals[0]?.listedAt ?? rentals[0]?.firstSeenAt ?? null)
    : (cars[0]?.listedAt ?? cars[0]?.firstSeenAt ?? null);
  const handle = handles.find((h) => h.platform === "instagram")?.handle;

  return (
    <div className="animate-fade-in-up">
      <Link
        href="/sources"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-50"
      >
        <ArrowLeft className="h-4 w-4" />
        All sources
      </Link>

      <section className="surface relative mb-10 overflow-hidden rounded-2xl p-6 sm:p-8">
        <div className="pointer-events-none absolute -top-24 right-0 -z-10 h-[300px] w-[300px] rounded-full bg-accent/10 blur-[120px]" />

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-ink-200">
            {source.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={source.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : isMarketplace ? (
              <Building2 className="h-7 w-7" strokeWidth={1.6} />
            ) : isRentals ? (
              <Home className="h-7 w-7" strokeWidth={1.6} />
            ) : (
              <Store className="h-7 w-7" strokeWidth={1.6} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">
                {isMarketplace ? (
                  <Building2 className="h-3 w-3" />
                ) : isRentals ? (
                  <Home className="h-3 w-3" />
                ) : (
                  <Store className="h-3 w-3" />
                )}
                {isMarketplace
                  ? "Marketplace"
                  : isRentals
                    ? "Rental broker"
                    : "Independent garage"}
              </span>
              {source.city && (
                <span className="chip">
                  <MapPin className="h-3 w-3" />
                  {source.city}
                </span>
              )}
            </div>

            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink-50 sm:text-4xl">
              {source.name}
            </h1>
            {source.description && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-300">
                {source.description}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {source.instagramUrl && (
                <a
                  href={source.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  {handle ? `@${handle} on Instagram` : "Instagram"}
                </a>
              )}
              {source.websiteUrl && (
                <a
                  href={source.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Website
                </a>
              )}
              {source.phone && (
                <a href={`tel:${source.phone}`} className="btn-ghost">
                  <Phone className="h-3.5 w-3.5" />
                  {source.phone}
                </a>
              )}
            </div>
          </div>

          <dl className="flex gap-6 sm:flex-col sm:gap-3 sm:text-right">
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-600">
                Live listings
              </dt>
              <dd className="font-display text-2xl font-bold text-ink-50">{count}</dd>
            </div>
            {newest && (
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-600">
                  Last posted
                </dt>
                <dd className="text-sm text-ink-300">{relativeAge(newest)}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      <h2 className="mb-4 font-display text-lg font-semibold tracking-tight text-ink-100">
        {isRentals ? "Homes listed" : "Cars listed"}
      </h2>

      {/* The listings use the preview dialog, which reads ?preview from the URL. */}
      <Suspense fallback={<div className="py-20" />}>
        <SourceListings
          cars={cars as unknown as CardListing[]}
          rentals={rentals as unknown as RentalCardListing[]}
        />
      </Suspense>
    </div>
  );
}
