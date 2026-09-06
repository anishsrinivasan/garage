"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

/**
 * Numbered pagination with first/last jumps.
 *
 * The previous control was prev/next only, so reaching page 21 of 21 took
 * twenty clicks and there was no way to see how deep the result set went.
 */
export function Pagination({
  page,
  totalPages,
  total,
}: {
  page: number;
  totalPages: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  if (totalPages <= 1) return null;

  function goTo(target: number) {
    const clamped = Math.min(Math.max(1, target), totalPages);
    if (clamped === page) return;
    const params = new URLSearchParams(searchParams.toString());
    if (clamped === 1) params.delete("page");
    else params.set("page", String(clamped));
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <nav
      aria-label="Pagination"
      className={`mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-6 transition-opacity sm:flex-row ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <p className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
        {total.toLocaleString("en-IN")} listing{total !== 1 ? "s" : ""} · page{" "}
        {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => goTo(1)}
          disabled={page <= 1}
          aria-label="First page"
          className="btn-ghost"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="btn-ghost"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </button>

        <div className="flex items-center gap-1">
          {pageWindow(page, totalPages).map((entry, i) =>
            entry === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-ink-600">
                …
              </span>
            ) : (
              <button
                key={entry}
                onClick={() => goTo(entry)}
                aria-current={entry === page ? "page" : undefined}
                className={
                  entry === page
                    ? "min-w-[2rem] rounded-lg border border-accent/40 bg-accent/15 px-2 py-1.5 font-mono text-xs font-bold text-accent"
                    : "min-w-[2rem] rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 py-1.5 font-mono text-xs text-ink-300 transition hover:border-white/20 hover:text-ink-50"
                }
              >
                {entry}
              </button>
            ),
          )}
        </div>

        <button
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="btn-ghost"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => goTo(totalPages)}
          disabled={page >= totalPages}
          aria-label="Last page"
          className="btn-ghost"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  );
}

/** First, last, and a window around the current page, with gaps elided. */
function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  const span = 1;
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - span; p <= page + span; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) out.push("gap");
    out.push(p);
    previous = p;
  }
  return out;
}
