"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { useSearchParams } from "next/navigation";

const FILTER_KEYS = [
  "search",
  "minPrice",
  "maxPrice",
  "minYear",
  "maxYear",
  "fuelType",
  "transmission",
  "bodyType",
  "sourcePlatform",
  "city",
];

export function MobileFilterToggle({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();

  const activeCount = FILTER_KEYS.filter(
    (k) => searchParams.get(k),
  ).length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-sm font-medium shadow-lg backdrop-blur-xl transition lg:hidden ${
          activeCount > 0
            ? "border border-accent/30 bg-accent/10 text-accent hover:border-accent/50 hover:bg-accent/15"
            : "border border-white/10 bg-ink-950/90 text-ink-200 hover:border-white/20 hover:bg-ink-900/95"
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {activeCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 font-mono text-[10px] font-bold text-ink-950">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative mt-auto max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-ink-950">
            <div className="sticky top-0 flex items-center justify-between border-b border-white/5 bg-ink-950 px-5 py-4">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-ink-100">
                  Filters
                </h2>
                {activeCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/15 px-1.5 font-mono text-[10px] font-bold text-accent ring-1 ring-inset ring-accent/30">
                    {activeCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-ink-300 transition hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </div>
        </div>
      )}

      <div className="surface sticky top-[84px] hidden rounded-xl p-5 lg:block">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-ink-100">
            Filters
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-500">
            Refine
          </span>
        </div>
        {children}
      </div>
    </>
  );
}
