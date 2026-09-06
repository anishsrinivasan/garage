import Link from "next/link";
import { getAdminListings } from "@/lib/admin-queries";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { ListingRowActions } from "@/components/listing-row-actions";
import { relativeAge } from "@preowned-cars/shared";

export const dynamic = "force-dynamic";

const STATUSES = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "review", label: "Needs review" },
  { value: "no-media", label: "No photos" },
  { value: "duplicate", label: "Duplicates" },
  { value: "sold", label: "Sold" },
  { value: "delisted", label: "Delisted" },
] as const;

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const result = await getAdminListings({
    search: sp.q,
    status: sp.status as never,
    source: sp.source,
    page: sp.page ? Number(sp.page) : 1,
  });

  return (
    <>
      <PageHeader
        title="Listings"
        description={`${result.total.toLocaleString("en-IN")} matching · page ${result.page} of ${result.totalPages}`}
      />

      <form className="mb-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search make, model, or URL…"
          className="field max-w-xs"
        />
        <select name="status" defaultValue={sp.status ?? ""} className="field max-w-[10rem]">
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={sp.source ?? ""} className="field max-w-[10rem]">
          <option value="">All sources</option>
          <option value="instagram">Instagram</option>
          <option value="cars24">Cars24</option>
          <option value="cardekho">CarDekho</option>
        </select>
        <button className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-ink-200 transition hover:bg-white/[0.07]">
          Apply
        </button>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState>No listings match those filters.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full min-w-[52rem] text-xs">
            <thead className="bg-white/[0.02] text-ink-500">
              <tr className="text-left">
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider">Car</th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider">Price</th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider">Garage</th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider">Status</th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider">Listed</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-3 py-2">
                    <Link
                      href={`/listings/${row.id}`}
                      className="font-medium text-ink-100 hover:text-accent"
                    >
                      {row.year} {row.make} {row.model}
                    </Link>
                    {row.variant && (
                      <span className="ml-1.5 text-ink-500">{row.variant}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-ink-200">
                    {row.price ? `₹${Number(row.price).toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-ink-400">{row.garageName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {!row.isActive && <Badge tone="bad">delisted</Badge>}
                      {row.saleStatus === "sold" && <Badge tone="warn">sold</Badge>}
                      {row.needsReview && <Badge tone="warn">review</Badge>}
                      {!row.isClusterHead && <Badge tone="info">dupe</Badge>}
                      {(row.media?.length ?? 0) === 0 && <Badge tone="bad">no photo</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-ink-500">
                    {relativeAge(row.listedAt ?? row.firstSeenAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ListingRowActions id={row.id} isActive={row.isActive} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={result.page} totalPages={result.totalPages} sp={sp} />
    </>
  );
}

function Pager({
  page,
  totalPages,
  sp,
}: {
  page: number;
  totalPages: number;
  sp: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;
  const link = (target: number) => {
    const params = new URLSearchParams(
      Object.entries(sp).filter(([, v]) => v) as [string, string][],
    );
    params.set("page", String(target));
    return `/listings?${params.toString()}`;
  };
  return (
    <div className="mt-4 flex items-center justify-center gap-2 text-xs">
      {page > 1 && (
        <Link href={link(page - 1)} className="rounded-lg border border-white/10 px-3 py-1.5">
          Previous
        </Link>
      )}
      <span className="text-ink-500">
        {page} / {totalPages}
      </span>
      {page < totalPages && (
        <Link href={link(page + 1)} className="rounded-lg border border-white/10 px-3 py-1.5">
          Next
        </Link>
      )}
    </div>
  );
}
