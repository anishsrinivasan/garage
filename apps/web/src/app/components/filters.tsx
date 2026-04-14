"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

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
    [router, searchParams, startTransition]
  );

  const current = (key: string) => searchParams.get(key) ?? "";

  return (
    <div className={`space-y-4 ${isPending ? "opacity-60" : ""}`}>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">
          Search
        </label>
        <input
          type="text"
          placeholder="Make, model, variant…"
          defaultValue={current("search")}
          onChange={(e) => update("search", e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">
            Min Price
          </label>
          <input
            type="number"
            placeholder="₹"
            defaultValue={current("minPrice")}
            onChange={(e) => update("minPrice", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">
            Max Price
          </label>
          <input
            type="number"
            placeholder="₹"
            defaultValue={current("maxPrice")}
            onChange={(e) => update("maxPrice", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">
            Min Year
          </label>
          <input
            type="number"
            placeholder="e.g. 2018"
            defaultValue={current("minYear")}
            onChange={(e) => update("minYear", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">
            Max Year
          </label>
          <input
            type="number"
            placeholder="e.g. 2024"
            defaultValue={current("maxYear")}
            onChange={(e) => update("maxYear", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <SelectFilter
        label="Fuel Type"
        paramKey="fuelType"
        options={options.fuelTypes}
        current={current("fuelType")}
        onChange={update}
      />
      <SelectFilter
        label="Transmission"
        paramKey="transmission"
        options={options.transmissions}
        current={current("transmission")}
        onChange={update}
      />
      <SelectFilter
        label="Body Type"
        paramKey="bodyType"
        options={options.bodyTypes}
        current={current("bodyType")}
        onChange={update}
      />
      <SelectFilter
        label="Source"
        paramKey="sourcePlatform"
        options={options.platforms}
        current={current("sourcePlatform")}
        onChange={update}
      />
      <SelectFilter
        label="City"
        paramKey="city"
        options={options.cities}
        current={current("city")}
        onChange={update}
      />

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">
          Sort By
        </label>
        <select
          value={current("sortBy") || "scrapedAt"}
          onChange={(e) => update("sortBy", e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="scrapedAt">Newest First</option>
          <option value="price">Price</option>
          <option value="year">Year</option>
          <option value="kmDriven">Km Driven</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">
          Order
        </label>
        <select
          value={current("sortOrder") || "desc"}
          onChange={(e) => update("sortOrder", e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>

      {searchParams.toString() && (
        <button
          onClick={() => {
            startTransition(() => router.push("/"));
          }}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
        >
          Clear All Filters
        </button>
      )}
    </div>
  );
}

function SelectFilter({
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
      <label className="mb-1 block text-xs font-medium text-gray-500 uppercase">
        {label}
      </label>
      <select
        value={current}
        onChange={(e) => onChange(paramKey, e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm capitalize focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt} className="capitalize">
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
