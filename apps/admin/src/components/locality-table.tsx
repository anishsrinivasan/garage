"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Eye, EyeOff, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import {
  upsertLocality,
  deleteLocality,
  setLocalityActive,
} from "@/lib/geography-actions";
import type { LocalityRow } from "@/lib/admin-queries";

/**
 * Localities, edited in place.
 *
 * Aliases are the field that matters and the field that changes, so they are
 * always visible and always one click from editable — not hidden behind a
 * detail page.
 */
export function LocalityTable({
  cityId,
  localities,
  search,
}: {
  cityId: string;
  localities: LocalityRow[];
  search: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function runSearch(term: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (term) params.set("q", term);
    else params.delete("q");
    startTransition(() => router.replace(`/geography?${params.toString()}`));
  }

  function act(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      setNotice(
        r.ok
          ? { text: r.message ?? "Saved", ok: true }
          : { text: r.error ?? "Failed", ok: false },
      );
      if (r.ok) {
        setEditing(null);
        setCreating(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          <input
            defaultValue={search}
            onKeyDown={(e) => e.key === "Enter" && runSearch(e.currentTarget.value)}
            placeholder="Search names and aliases…"
            className="field pl-9"
          />
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-ink-200 transition hover:bg-white/[0.07]"
        >
          <Plus className="h-3.5 w-3.5" />
          New locality
        </button>
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
      </div>

      {notice && (
        <p className={`text-[11px] ${notice.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {notice.text}
        </p>
      )}

      {creating && (
        <LocalityForm
          cityId={cityId}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => act(() => upsertLocality(values))}
        />
      )}

      {localities.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-ink-500">
          {search ? `Nothing matches "${search}".` : "No localities yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
          <table className="w-full min-w-[44rem] text-xs">
            <thead className="bg-white/[0.02] text-ink-500">
              <tr className="text-left">
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider">Locality</th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider">Aliases</th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wider">Live</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {localities.map((loc) =>
                editing === loc.id ? (
                  <tr key={loc.id} className="border-t border-white/5">
                    <td colSpan={4} className="p-3">
                      <LocalityForm
                        cityId={cityId}
                        initial={loc}
                        onCancel={() => setEditing(null)}
                        onSubmit={(values) => act(() => upsertLocality({ ...values, id: loc.id }))}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={loc.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 align-top">
                      <button
                        onClick={() => setEditing(loc.id)}
                        className="text-left font-medium text-ink-100 hover:text-accent"
                      >
                        {loc.name}
                      </button>
                      <span className="block font-mono text-[10px] text-ink-600">/{loc.slug}</span>
                      {!loc.isActive && (
                        <span className="mt-0.5 inline-block rounded bg-white/5 px-1 text-[9px] uppercase text-ink-500">
                          hidden
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {loc.aliases.slice(0, 8).map((a) => (
                          <span
                            key={a}
                            className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-ink-400"
                          >
                            {a}
                          </span>
                        ))}
                        {loc.aliases.length > 8 && (
                          <span className="px-1 text-[10px] text-ink-600">
                            +{loc.aliases.length - 8}
                          </span>
                        )}
                        {loc.aliases.length === 0 && (
                          <span className="text-[10px] text-amber-300">no aliases</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right align-top font-mono text-ink-300">
                      {loc.listingCount}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <div className="flex justify-end gap-1">
                        <button
                          title={loc.isActive ? "Hide from filters" : "Show in filters"}
                          onClick={() => act(() => setLocalityActive(loc.id, !loc.isActive))}
                          className="rounded border border-white/10 p-1 text-ink-400 hover:bg-white/5 hover:text-ink-100"
                        >
                          {loc.isActive ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                        <button
                          title={
                            loc.listingCount > 0
                              ? "Has listings — hide it instead"
                              : "Delete"
                          }
                          onClick={() => act(() => deleteLocality(loc.id))}
                          disabled={loc.listingCount > 0}
                          className="rounded border border-white/10 p-1 text-ink-400 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LocalityForm({
  cityId,
  initial,
  onCancel,
  onSubmit,
}: {
  cityId: string;
  initial?: LocalityRow;
  onCancel: () => void;
  onSubmit: (values: {
    cityId: string;
    name: string;
    slug?: string;
    aliases: string;
    latitude: number | null;
    longitude: number | null;
    isActive: boolean;
  }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [aliases, setAliases] = useState((initial?.aliases ?? []).join("\n"));
  const [lat, setLat] = useState(initial?.latitude?.toString() ?? "");
  const [lon, setLon] = useState(initial?.longitude?.toString() ?? "");

  const num = (v: string) => {
    const n = Number(v);
    return v.trim() && Number.isFinite(n) ? n : null;
  };

  return (
    <div className="space-y-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label className="field-label">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="field" autoFocus />
        </div>
        <div>
          <label className="field-label">Latitude</label>
          <input value={lat} onChange={(e) => setLat(e.target.value)} className="field" />
        </div>
        <div>
          <label className="field-label">Longitude</label>
          <input value={lon} onChange={(e) => setLon(e.target.value)} className="field" />
        </div>
      </div>
      <div>
        <label className="field-label">Aliases — one per line</label>
        <textarea
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          rows={4}
          className="field resize-y font-mono text-[11px]"
          placeholder={"velacheri\nvellachery\nnear velachery signal"}
        />
        <p className="mt-1 text-[10px] text-ink-600">
          Lower-cased and de-duplicated on save. Add the spellings brokers actually use.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() =>
            onSubmit({
              cityId,
              name,
              aliases,
              latitude: num(lat),
              longitude: num(lon),
              isActive: initial?.isActive ?? true,
            })
          }
          disabled={!name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-gradient px-3 py-1.5 text-[11px] font-bold text-ink-950 disabled:opacity-50"
        >
          <Check className="h-3 w-3" />
          Save
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-ink-300"
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
      </div>
    </div>
  );
}
