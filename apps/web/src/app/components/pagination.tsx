"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  if (totalPages <= 1) return null;

  function goTo(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    startTransition(() => {
      router.push(`/?${params.toString()}`);
    });
  }

  return (
    <div
      className={`mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-6 transition-opacity sm:flex-row ${isPending ? "opacity-60" : ""}`}
    >
      <p className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
        {total.toLocaleString("en-IN")} listing{total !== 1 ? "s" : ""}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          className="btn-ghost"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5">
          <span className="font-mono text-sm font-semibold text-ink-50">
            {page}
          </span>
          <span className="text-xs text-ink-500">of</span>
          <span className="font-mono text-xs text-ink-400">{totalPages}</span>
        </div>
        <button
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages}
          className="btn-ghost"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
