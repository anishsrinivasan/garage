import { getCitiesWithCounts, getLocalities, getUnmatchedLocations } from "@/lib/admin-queries";
import { PageHeader, Panel, Badge, EmptyState } from "@/components/ui";
import { CityList } from "@/components/city-list";
import { LocalityTable } from "@/components/locality-table";
import { UnmatchedLocations } from "@/components/unmatched-locations";

export const dynamic = "force-dynamic";

/**
 * Master data for geography.
 *
 * Localities are seeded from OpenStreetMap, but no gazetteer contains how
 * brokers actually write a place. The alias list is what gets edited constantly,
 * so this screen is built around editing it quickly.
 */
export default async function GeographyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const cityRows = await getCitiesWithCounts();
  const selectedCity =
    cityRows.find((c) => c.id === sp.city) ?? cityRows[0] ?? null;

  const [localityRows, unmatched] = selectedCity
    ? await Promise.all([
        getLocalities(selectedCity.id, sp.q),
        getUnmatchedLocations(selectedCity.id),
      ])
    : [[], []];

  const aliasTotal = localityRows.reduce((n, l) => n + l.aliases.length, 0);

  return (
    <>
      <PageHeader
        title="Geography"
        description="Cities and localities. Aliases are what make a broker's spelling resolve to the right filter."
      />

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title={`Cities (${cityRows.length})`}>
            <CityList cities={cityRows} selectedId={selectedCity?.id ?? null} />
          </Panel>

          {selectedCity && unmatched.length > 0 && (
            <Panel title="Unmatched locations">
              {/* Each of these is either a missing alias or a missing locality —
                  a concrete work queue rather than a vague quality metric. */}
              <UnmatchedLocations
                cityId={selectedCity.id}
                rows={unmatched}
                localities={localityRows.map((l) => ({ id: l.id, name: l.name }))}
              />
            </Panel>
          )}
        </div>

        <div>
          {!selectedCity ? (
            <EmptyState>Add a city to get started.</EmptyState>
          ) : (
            <Panel
              title={`${selectedCity.name} — ${localityRows.length} localities`}
              action={
                <span className="font-mono text-[11px] text-ink-500">
                  {aliasTotal} aliases
                  {localityRows.length > 0 &&
                    ` · ${(aliasTotal / localityRows.length).toFixed(1)} each`}
                </span>
              }
            >
              <LocalityTable
                cityId={selectedCity.id}
                localities={localityRows}
                search={sp.q ?? ""}
              />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
