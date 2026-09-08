"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { upsertCity, setCityActive } from "@/lib/geography-actions";
import type { CityRow } from "@/lib/admin-queries";

export function CityList({
  cities,
  selectedId,
}: {
  cities: CityRow[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await upsertCity({ name, state });
      if (!result.ok) return setError(result.error);
      setName("");
      setState("");
      setAdding(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {cities.map((city) => (
          <li key={city.id}>
            <Link
              href={`/geography?city=${city.id}`}
              className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs transition ${
                city.id === selectedId
                  ? "bg-accent/10 text-ink-50 ring-1 ring-inset ring-accent/30"
                  : "text-ink-300 hover:bg-white/5"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {city.name}
                  {!city.isActive && <span className="ml-1.5 text-ink-600">(hidden)</span>}
                </span>
                <span className="block truncate text-[10px] text-ink-500">
                  {city.state ?? city.country} · /{city.slug}
                </span>
              </span>
              <span className="shrink-0 text-right font-mono text-[10px] text-ink-500">
                <span className="block">{city.localityCount} loc</span>
                <span className="block">{city.listingCount} live</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="City name"
            className="field"
          />
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="State (optional)"
            className="field"
          />
          {error && <p className="text-[11px] text-rose-300">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={add}
              disabled={pending || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-gradient px-2.5 py-1.5 text-[11px] font-bold text-ink-950 disabled:opacity-50"
            >
              {pending && <Loader2 className="h-3 w-3 animate-spin" />}
              Add
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-ink-300"
            >
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-ink-600">
            Then seed its localities:{" "}
            <code className="font-mono">bun run apps/scraper/src/seed-geography.ts &lt;slug&gt;</code>
          </p>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 px-2.5 py-2 text-[11px] text-ink-400 transition hover:border-white/30 hover:text-ink-200"
        >
          <Plus className="h-3 w-3" />
          Add city
        </button>
      )}
    </div>
  );
}
