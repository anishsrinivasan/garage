import Image from "next/image";
import { getAdminGarages } from "@/lib/admin-queries";
import { PageHeader, Panel, Badge, EmptyState } from "@/components/ui";
import { AddInstagramGarage } from "@/components/add-instagram-garage";
import { GarageEditor } from "@/components/garage-editor";

export const dynamic = "force-dynamic";

export default async function GaragesPage() {
  const rows = await getAdminGarages();

  return (
    <>
      <PageHeader
        title="Garages"
        description="Dealers and marketplaces whose listings feed the catalogue."
      />

      <div className="mb-6">
        <Panel title="Add a garage from Instagram">
          <AddInstagramGarage />
        </Panel>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No garages yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {rows.map((garage) => (
            <details
              key={garage.id}
              className="group rounded-xl border border-white/[0.06] bg-ink-900/40"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                {garage.logoUrl ? (
                  <Image
                    src={garage.logoUrl}
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 font-display text-xs font-bold text-ink-400">
                    {garage.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-100">
                    {garage.name}
                  </span>
                  <span className="block truncate text-[11px] text-ink-500">
                    /{garage.slug} · {garage.city ?? "no city"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {!garage.isActive && <Badge tone="bad">inactive</Badge>}
                  <Badge tone={garage.kind === "marketplace" ? "info" : "neutral"}>
                    {garage.kind}
                  </Badge>
                  <span className="font-mono text-xs text-ink-400">
                    {garage.listingCount}
                  </span>
                </span>
              </summary>
              <div className="border-t border-white/5 p-4">
                <GarageEditor garage={garage} />
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
