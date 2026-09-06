import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getAdminListing } from "@/lib/admin-queries";
import { PageHeader, Panel, Badge } from "@/components/ui";
import { ListingEditor } from "@/components/listing-editor";
import { HeroPicker } from "@/components/hero-picker";
import { relativeAge } from "@preowned-cars/shared";

export const dynamic = "force-dynamic";

export default async function AdminListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getAdminListing(id);
  if (!listing) notFound();

  const publicUrl = process.env.NEXT_PUBLIC_WEB_URL
    ? `${process.env.NEXT_PUBLIC_WEB_URL}/listings/${listing.id}`
    : null;

  return (
    <>
      <Link
        href="/listings"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-50"
      >
        <ArrowLeft className="h-4 w-4" />
        All listings
      </Link>

      <PageHeader
        title={`${listing.year} ${listing.make} ${listing.model}`}
        description={listing.variant ?? undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {!listing.isActive && <Badge tone="bad">delisted</Badge>}
            {listing.needsReview && <Badge tone="warn">needs review</Badge>}
            {!listing.isClusterHead && <Badge tone="info">duplicate</Badge>}
            <a
              href={listing.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-ink-300 hover:bg-white/5"
            >
              <ExternalLink className="h-3 w-3" />
              Source
            </a>
            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-ink-300 hover:bg-white/5"
              >
                <ExternalLink className="h-3 w-3" />
                Live page
              </a>
            )}
          </div>
        }
      />

      {listing.needsReview && listing.reviewReason && (
        <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm text-amber-100">
          <p className="font-semibold">Flagged for review</p>
          <p className="mt-1 text-xs text-amber-200/80">{listing.reviewReason}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel title="Edit">
            <ListingEditor listing={listing} />
          </Panel>

          {listing.description && (
            <Panel title="Source caption">
              <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-ink-300">
                {listing.description}
              </p>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Photos">
            {/* The vision scorer picks the hero automatically, but it is a model
                and it will sometimes be wrong. This is the manual override. */}
            <HeroPicker
              listingId={listing.id}
              media={listing.media ?? []}
              heroMediaUrl={listing.heroMediaUrl}
            />
          </Panel>

          <Panel title="Provenance">
            <dl className="space-y-2 text-xs">
              <Row label="Source" value={listing.sourcePlatform} />
              <Row label="Garage" value={listing.garageName ?? "—"} />
              <Row label="Listed" value={relativeAge(listing.listedAt) ?? "—"} />
              <Row label="First seen" value={relativeAge(listing.firstSeenAt) ?? "—"} />
              <Row label="Last confirmed" value={relativeAge(listing.lastSeenAt) ?? "—"} />
              <Row
                label="Delisted"
                value={listing.delistedAt ? (relativeAge(listing.delistedAt) ?? "—") : "—"}
              />
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </dt>
      <dd className="truncate text-ink-200">{value}</dd>
    </div>
  );
}
