"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Search, X, ChevronDown } from "lucide-react";

interface FilterOption {
  cities: string[];
  fuelTypes: string[];
  transmissions: string[];
  bodyTypes: string[];
  platforms: string[];
}

export function Filters({ options }: { options: FilterOption }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      startTransition(() => {
        router.push(`/?${params.toString()}`);
      });
    },
    [router, searchParams, startTransition],
  );

  const current = (key: string) => searchParams.get(key) ?? "";
  const activeCount = Array.from(searchParams.keys()).filter(
    (k) => !["sortBy", "sortOrder", "page"].includes(k),
  ).length;

  return (
    <div className={`space-y-5 transition-opacity ${isPending ? "opacity-60" : ""}`}>
      <div>
        <label className="field-label">Search</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          <input
            type="text"
            placeholder="Make, model, variant…"
            defaultValue={current("search")}
            onChange={(e) => update("search", e.target.value)}
            className="field pl-9"
          />
        </div>
      </div>

      <div>
        <label className="field-label">Price Range (₹)</label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Min"
            defaultValue={current("minPrice")}
            onChange={(e) => update("minPrice", e.target.value)}
            className="field"
          />
          <input
            type="number"
            placeholder="Max"
            defaultValue={current("maxPrice")}
            onChange={(e) => update("maxPrice", e.target.value)}
            className="field"
          />
        </div>
      </div>

      <div>
        <label className="field-label">Year Range</label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="From"
            defaultValue={current("minYear")}
            onChange={(e) => update("minYear", e.target.value)}
            className="field"
          />
          <input
            type="number"
            placeholder="To"
            defaultValue={current("maxYear")}
            onChange={(e) => update("maxYear", e.target.value)}
            className="field"
          />
        </div>
      </div>

      <PillSelect
        label="Fuel"
        paramKey="fuelType"
        options={options.fuelTypes}
        current={current("fuelType")}
        onChange={update}
      />
      <PillSelect
        label="Transmission"
        paramKey="transmission"
        options={options.transmissions}
        current={current("transmission")}
        onChange={update}
      />
      <PillSelect
        label="Body"
        paramKey="bodyType"
        options={options.bodyTypes}
        current={current("bodyType")}
        onChange={update}
      />

      <SelectField
        label="Source"
        paramKey="sourcePlatform"
        options={options.platforms}
        current={current("sourcePlatform")}
        onChange={update}
      />
      <SelectField
        label="City"
        paramKey="city"
        options={options.cities}
        current={current("city")}
        onChange={update}
      />

      <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-4">
        <div>
          <label className="field-label">Sort</label>
          <SelectRaw
            value={current("sortBy") || "scrapedAt"}
            onChange={(v) => update("sortBy", v)}
          >
            <option value="scrapedAt">Newest</option>
            <option value="price">Price</option>
            <option value="year">Year</option>
            <option value="kmDriven">Km</option>
          </SelectRaw>
        </div>
        <div>
          <label className="field-label">Order</label>
          <SelectRaw
            value={current("sortOrder") || "desc"}
            onChange={(v) => update("sortOrder", v)}
          >
            <option value="desc">↓ Desc</option>
            <option value="asc">↑ Asc</option>
          </SelectRaw>
        </div>
      </div>

      {activeCount > 0 && (
        <button
          onClick={() => startTransition(() => router.push("/"))}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent/10"
        >
          <X className="h-3.5 w-3.5" />
          Clear {activeCount} filter{activeCount !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

function PillSelect({
  label,
  paramKey,
  options,
  current,
  onChange,
}: {
  label: string;
  paramKey: string;
  options: string[];
  current: string;
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
          className={pillClass(current === "")}
        >
          All
        </button>
        {options.map((opt) => (
          <button
            type="button"
            key={opt}
            onClick={() => onChange(paramKey, opt)}
            className={pillClass(current === opt)}
          >
            {opt}
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
  options: string[];
  current: string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <SelectRaw value={current} onChange={(v) => onChange(paramKey, v)}>
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </SelectRaw>
    </div>
  );
}

function SelectRaw({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field cursor-pointer appearance-none pr-8 capitalize"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
    </div>
  );
}
