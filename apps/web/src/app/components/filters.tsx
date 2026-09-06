"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Search, X, ChevronDown, Loader2 } from "lucide-react";
import type { FilterOptions } from "@/app/lib/queries";

/** Keys that are navigation state, not user-chosen filters. */
const NON_FILTER_KEYS = ["sortBy", "sortOrder", "page"];

const SEARCH_DEBOUNCE_MS = 350;

export function Filters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  /**
   * Every filter change used to `router.push`, including one per keystroke in
   * the search box — typing "creta" fired five full RSC round-trips and five
   * database queries, and left five entries in the back-button history. Now
   * search is debounced and all filter changes `replace` instead of `push`.
   */
  const commit = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("page");
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [router, pathname, searchParams],
  );

  const update = useCallback(
    (key: string, value: string) => {
      commit((params) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
    },
    [commit],
  );

  const current = (key: string) => searchParams.get(key) ?? "";
  const activeCount = Array.from(searchParams.keys()).filter(
    (k) => !NON_FILTER_KEYS.includes(k),
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="field-label mb-0">Filters</span>
        {isPending && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-label="Updating results" />
        )}
      </div>

      <DebouncedSearch value={current("search")} onChange={(v) => update("search", v)} />

      <PillSelect
        label="Listed"
        paramKey="freshness"
        options={[
          { value: "today", label: "24h" },
          { value: "week", label: "7 days" },
          { value: "month", label: "30 days" },
          { value: "quarter", label: "90 days" },
        ]}
        current={current("freshness")}
        allLabel="Any time"
        onChange={update}
      />

      <RangeFields
        label="Price (₹)"
        minKey="minPrice"
        maxKey="maxPrice"
        minPlaceholder="Min"
        maxPlaceholder="Max"
        hint={priceHint(options.priceRange)}
        current={current}
        onChange={update}
      />

      <RangeFields
        label="Year"
        minKey="minYear"
        maxKey="maxYear"
        minPlaceholder={String(options.yearRange.min)}
        maxPlaceholder={String(options.yearRange.max)}
        current={current}
        onChange={update}
      />

      <PillSelect
        label="Fuel"
        paramKey="fuelType"
        options={options.fuelTypes.map((o) => ({
          value: o.value,
          label: o.value,
          count: o.count,
        }))}
        current={current("fuelType")}
        onChange={update}
      />
      <PillSelect
        label="Transmission"
        paramKey="transmission"
        options={options.transmissions.map((o) => ({
          value: o.value,
          label: o.value,
          count: o.count,
        }))}
        current={current("transmission")}
        onChange={update}
      />
      <PillSelect
        label="Body"
        paramKey="bodyType"
        options={options.bodyTypes.map((o) => ({
          value: o.value,
          label: o.value,
          count: o.count,
        }))}
        current={current("bodyType")}
        onChange={update}
      />

      <SelectField
        label="Make"
        paramKey="search"
        options={options.makes.map((m) => ({
          value: m.value,
          label: `${m.value} (${m.count})`,
        }))}
        current={current("search")}
        onChange={update}
      />

      <SelectField
        label="Garage"
        paramKey="garage"
        options={options.garages.map((g) => ({
          value: g.id,
          label: `${g.name} (${g.count})`,
        }))}
        current={current("garage")}
        onChange={update}
      />

      <SelectField
        label="Source"
        paramKey="sourcePlatform"
        options={options.platforms.map((p) => ({
          value: p.value,
          label: `${p.value} (${p.count})`,
        }))}
        current={current("sourcePlatform")}
        onChange={update}
      />

      {/* Only one city in the catalogue today; the dropdown was a dead control. */}
      {options.cities.length > 1 && (
        <SelectField
          label="City"
          paramKey="city"
          options={options.cities.map((c) => ({ value: c, label: c }))}
          current={current("city")}
          onChange={update}
        />
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-4">
        <div>
          <label className="field-label" htmlFor="sortBy">
            Sort
          </label>
          <SelectRaw
            id="sortBy"
            value={current("sortBy") || "relevance"}
            onChange={(v) => update("sortBy", v)}
          >
            <option value="relevance">Best match</option>
            <option value="listedAt">Recently listed</option>
            <option value="price">Price</option>
            <option value="year">Year</option>
            <option value="kmDriven">Km driven</option>
          </SelectRaw>
        </div>
        <div>
          <label className="field-label" htmlFor="sortOrder">
            Order
          </label>
          <SelectRaw
            id="sortOrder"
            value={current("sortOrder") || "desc"}
            onChange={(v) => update("sortOrder", v)}
            disabled={(current("sortBy") || "relevance") === "relevance"}
          >
            <option value="desc">↓ High to low</option>
            <option value="asc">↑ Low to high</option>
          </SelectRaw>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-ink-400">
        <input
          type="checkbox"
          checked={current("includeStale") === "1"}
          onChange={(e) => update("includeStale", e.target.checked ? "1" : "")}
          className="mt-0.5 h-3.5 w-3.5 accent-orange-500"
        />
        <span>
          Include unconfirmed listings
          <span className="mt-0.5 block text-ink-500">
            Cars we haven&apos;t been able to re-verify recently. They may already be sold.
          </span>
        </span>
      </label>

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

function priceHint(range: { min: number; max: number }): string | null {
  if (!range.max) return null;
  const fmt = (n: number) =>
    n >= 10_000_000
      ? `${(n / 10_000_000).toFixed(1)} Cr`
      : `${Math.round(n / 100_000)} L`;
  return `${fmt(range.min)} – ${fmt(range.max)}`;
}

/**
 * Local state so typing stays responsive, with a trailing debounce before the
 * URL (and therefore the server query) is touched.
 */
function DebouncedSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Reflect external resets ("Clear filters") without clobbering active typing.
  useEffect(() => {
    setDraft((prev) => (prev === value ? prev : value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChangeRef.current(draft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, value]);

  return (
    <div>
      <label className="field-label" htmlFor="search">
        Search
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
        <input
          id="search"
          type="search"
          placeholder="Make, model, variant…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="field pl-9"
        />
      </div>
    </div>
  );
}

function RangeFields({
  label,
  minKey,
  maxKey,
  minPlaceholder,
  maxPlaceholder,
  hint,
  current,
  onChange,
}: {
  label: string;
  minKey: string;
  maxKey: string;
  minPlaceholder: string;
  maxPlaceholder: string;
  hint?: string | null;
  current: (key: string) => string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="field-label">{label}</label>
        {hint && <span className="mb-1.5 font-mono text-[10px] text-ink-600">{hint}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DebouncedNumber
          placeholder={minPlaceholder}
          value={current(minKey)}
          onChange={(v) => onChange(minKey, v)}
        />
        <DebouncedNumber
          placeholder={maxPlaceholder}
          value={current(maxKey)}
          onChange={(v) => onChange(maxKey, v)}
        />
      </div>
    </div>
  );
}

function DebouncedNumber({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setDraft((prev) => (prev === value ? prev : value));
  }, [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChangeRef.current(draft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, value]);

  return (
    <input
      type="number"
      inputMode="numeric"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      className="field"
    />
  );
}

type PillOption = { value: string; label: string; count?: number };

function PillSelect({
  label,
  paramKey,
  options,
  current,
  allLabel = "All",
  onChange,
}: {
  label: string;
  paramKey: string;
  options: PillOption[];
  current: string;
  allLabel?: string;
  onChange: (key: string, value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(paramKey, "")}
          aria-pressed={current === ""}
          className={pillClass(current === "")}
        >
          {allLabel}
        </button>
        {options.map((opt) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => onChange(paramKey, opt.value)}
            aria-pressed={current === opt.value}
            className={pillClass(current === opt.value)}
          >
            {opt.label}
            {/* Counts turn a guess into a decision — you can see that picking
                "coupe" leaves you seven cars before you click it. */}
            {opt.count != null && (
              <span className="ml-1 font-mono text-[9px] opacity-60">{opt.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function pillClass(active: boolean): string {
  return active
    ? "rounded-md border border-accent/40 bg-accent/15 px-2.5 py-1 text-[11px] font-semibold capitalize text-accent shadow-[0_0_0_3px_rgba(251,146,60,0.08)] transition"
    : "rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium capitalize text-ink-300 transition hover:border-white/20 hover:bg-white/5 hover:text-ink-50";
}

function SelectField({
  label,
  paramKey,
  options,
  current,
  onChange,
}: {
  label: string;
  paramKey: string;
  options: Array<{ value: string; label: string }>;
  current: string;
  onChange: (key: string, value: string) => void;
}) {
  if (options.length === 0) return null;
  const known = options.some((o) => o.value === current);
  return (
    <div>
      <label className="field-label" htmlFor={paramKey}>
        {label}
      </label>
      <SelectRaw
        id={paramKey}
        value={known ? current : ""}
        onChange={(v) => onChange(paramKey, v)}
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </SelectRaw>
    </div>
  );
}

function SelectRaw({
  id,
  value,
  onChange,
  disabled = false,
  children,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="field cursor-pointer appearance-none pr-8 capitalize disabled:cursor-not-allowed disabled:opacity-40"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
    </div>
  );
}
