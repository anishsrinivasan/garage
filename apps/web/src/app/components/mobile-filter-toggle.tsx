"use client";

import { useState } from "react";
import { SlidersHorizontal, ChevronUp } from "lucide-react";

export function MobileFilterToggle({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-ink-200 transition hover:border-white/20 hover:bg-white/[0.06] lg:hidden"
      >
        {open ? (
          <>
            <ChevronUp className="h-4 w-4" />
            Hide filters
          </>
        ) : (
          <>
            <SlidersHorizontal className="h-4 w-4" />
            Show filters
          </>
        )}
      </button>
      <div className={`${open ? "block" : "hidden"} lg:block`}>{children}</div>
    </>
  );
}
