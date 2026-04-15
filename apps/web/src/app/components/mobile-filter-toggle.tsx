"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

export function MobileFilterToggle({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-ink-950/90 px-5 py-3 text-sm font-medium text-ink-200 shadow-lg backdrop-blur-xl transition hover:border-white/20 hover:bg-ink-900/95 lg:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative mt-auto max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-ink-950">
            <div className="sticky top-0 flex items-center justify-between border-b border-white/5 bg-ink-950 px-5 py-4">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-ink-100">
                Filters
              </h2>
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
