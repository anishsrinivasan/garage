"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, ShieldCheck, X } from "lucide-react";
import type { RentalFacets } from "@/app/lib/rentals-queries";
import { rentalLabel, formatRent } from "@/app/lib/rental-format";

// View state, not filtering. `view` and `preview` arrived with the swipe deck
// and the preview dialog; leaving them out of this list made the "refine"
// badge claim two active filters the moment someone opened a listing.
const NON_FILTER_KEYS = ["sortBy", "sortOrder", "page", "view", "preview"];
const DEBOUNCE_MS = 350;

/**
 * Rental filters.
 *
 * Rent is the first thing anyone sets, so it leads — with preset bands as well
 * as free entry, because "under 25k" is how people actually think about a
 * budget, not a pair of numbers.
 */
export function RentalFilters({ facets }: { facets: RentalFacets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const commit = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("page");
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams],
  );

  const update = useCallback(
    (key: string, value: string) => {
      commit((p) => (value ? p.set(key, value) : p.delete(key)));
    },
    [commit],
  );

  const current = (key: string) => searchParams.get(key) ?? "";
  const activeCount = Array.from(searchParams.keys()).filter(
    (k) => !NON_FILTER_KEYS.includes(k),
  ).length;

  const bhkSelected = new Set((current("bhk") || "").split(",").filter(Boolean));
  const toggleBhk = (value: string) => {
    const next = new Set(bhkSelected);
    next.has(value) ? next.delete(value) : next.add(value);
    update("bhk", [...next].sort().join(","));
  };

  return (
    <div className="space-y-5">
      {isPending && (
        <div className="flex items-center gap-1.5 text-[11px] text-accent">
          <Loader2 className="h-3 w-3 animate-spin" />
          Updating results…
        </div>
      )}

      <DebouncedInput
        id="search"
        label="Search"
        placeholder="Locality, landmark, description…"
        value={current("search")}
        onChange={(v) => update("search", v)}
        icon
      />

      <div>
        <label className="field-label">Budget (₹/month)</label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {[
            ["", "Any"],
            ["0-15000", "≤15k"],
            ["15000-25000", "15–25k"],
            ["25000-40000", "25–40k"],
            ["40000-70000", "40–70k"],
            ["70000-", "70k+"],
          ].map(([value, text]) => {
            const active = `${current("minRent")}-${current("maxRent")}` === value ||
              (value === "" && !current("minRent") && !current("maxRent"));
            return (
              <button
                key={text}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  const [min, max] = value.split("-");
                  commit((p) => {
                    min ? p.set("minRent", min) : p.delete("minRent");
                    max ? p.set("maxRent", max) : p.delete("maxRent");
                  });
                }}
                className={pill(active)}
              >
                {text}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DebouncedInput
            id="minRent"
            placeholder="Min"
            type="number"
            value={current("minRent")}
            onChange={(v) => update("minRent", v)}
          />
          <DebouncedInput
            id="maxRent"
            placeholder="Max"
            type="number"
            value={current("maxRent")}
            onChange={(v) => update("maxRent", v)}
          />
        </div>
        {facets.rentRange.max > 0 && (
          <p className="mt-1 font-mono text-[10px] text-ink-600">
            Listed range ₹{formatRent(facets.rentRange.min)} – ₹{formatRent(facets.rentRange.max)}
          </p>
        )}
      </div>

      {facets.bhk.length > 0 && (
        <div>
          <label className="field-label">Bedrooms</label>
          <div className="flex flex-wrap gap-1.5">
            {facets.bhk.map((b) => (
              <button
                key={b.value}
                type="button"
                aria-pressed={bhkSelected.has(String(b.value))}
                onClick={() => toggleBhk(String(b.value))}
                className={pill(bhkSelected.has(String(b.value)))}
              >
                {b.value} BHK
                <span className="ml-1 font-mono text-[9px] opacity-60">{b.count}</span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-ink-600">4 BHK includes larger homes.</p>
        </div>
      )}

      <PillGroup
        label="Furnishing"
        paramKey="furnishing"
        options={facets.furnishing}
        current={current("furnishing")}
        onChange={update}
      />
      <PillGroup
        label="Property"
        paramKey="propertyType"
        options={facets.propertyType}
        current={current("propertyType")}
        onChange={update}
      />
      <PillGroup
        label="Tenants"
        paramKey="tenantPreference"
        options={facets.tenantPreference}
        current={current("tenantPreference")}
        onChange={update}
      />

      {/* A toggle, not a two-way choice. A caption that never mentions a gated
          community has not said it is not one, so there is nothing honest to
          put behind an "Open" option — only "gated only" or no opinion. */}
      {facets.gatedCommunity > 0 && (
        <div>
          <label className="field-label" htmlFor="gated">
            Community
          </label>
          <button
            id="gated"
            type="button"
            onClick={() => update("gated", current("gated") === "1" ? "" : "1")}
            aria-pressed={current("gated") === "1"}
            className={`mt-2 inline-flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
              current("gated") === "1"
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-white/[0.06] bg-white/[0.02] text-ink-300 hover:border-white/[0.12] hover:text-ink-100"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Gated community
            </span>
            <span className="font-mono text-[10px] opacity-60">
              {facets.gatedCommunity}
            </span>
          </button>
        </div>
      )}

      <PillGroup
        label="Listed"
        paramKey="freshness"
        allLabel="Any time"
        options={[
          { value: "today", count: 0 },
          { value: "week", count: 0 },
          { value: "month", count: 0 },
        ]}
        labels={{ today: "24h", week: "7 days", month: "30 days" }}
        current={current("freshness")}
        onChange={update}
      />

      {facets.localities.length > 0 && (
        <div>
          <label className="field-label" htmlFor="locality">
            Locality
          </label>
          <select
            id="locality"
            value={current("locality")}
            onChange={(e) => update("locality", e.target.value)}
            className="field cursor-pointer appearance-none"
          >
            <option value="">All localities</option>
            {facets.localities.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.count})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="border-t border-white/5 pt-4">
        <label className="field-label" htmlFor="sortBy">
          Sort
        </label>
        <select
          id="sortBy"
          value={current("sortBy") || "relevance"}
          onChange={(e) => update("sortBy", e.target.value)}
          className="field cursor-pointer appearance-none"
        >
          <option value="relevance">Best match</option>
          <option value="listedAt">Recently listed</option>
          <option value="rent">Rent: low to high</option>
          <option value="area">Largest first</option>
        </select>
      </div>

      {activeCount > 0 && (
        <button
          onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent/10"
        >
          <X className="h-3.5 w-3.5" />
          Clear {activeCount} filter{activeCount !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

function pill(active: boolean): string {
  return active
    ? "rounded-md border border-accent/40 bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent transition"
    : "rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-ink-300 transition hover:border-white/20 hover:bg-white/5 hover:text-ink-50";
}

function PillGroup({
  label,
  paramKey,
  options,
  current,
  allLabel = "All",
  labels,
  onChange,
}: {
  label: string;
  paramKey: string;
  options: Array<{ value: string; count: number }>;
  current: string;
  allLabel?: string;
  labels?: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onChange(paramKey, "")} className={pill(current === "")}>
          {allLabel}
        </button>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={current === o.value}
            onClick={() => onChange(paramKey, o.value)}
            className={pill(current === o.value)}
          >
            {labels?.[o.value] ?? rentalLabel(o.value)}
            {o.count > 0 && <span className="ml-1 font-mono text-[9px] opacity-60">{o.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function DebouncedInput({
  id,
  label,
  value,
  placeholder,
  type = "text",
  icon = false,
  onChange,
}: {
  id: string;
  label?: string;
  value: string;
  placeholder?: string;
  type?: string;
  icon?: boolean;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef(onChange);
  ref.current = onChange;

  useEffect(() => setDraft((p) => (p === value ? p : value)), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => ref.current(draft), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, value]);

  return (
    <div>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
        )}
        <input
          id={id}
          type={type}
          inputMode={type === "number" ? "numeric" : undefined}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={`field ${icon ? "pl-9" : ""}`}
        />
      </div>
    </div>
  );
}
