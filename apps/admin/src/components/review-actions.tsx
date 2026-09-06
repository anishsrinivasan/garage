"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { clearReviewFlag, updateListing } from "@/lib/actions";

export function ReviewActions({
  id,
  suggestions,
  currentPrice,
}: {
  id: string;
  suggestions: number[];
  currentPrice: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(price: number) {
    startTransition(async () => {
      const result = await updateListing(id, {
        price: String(price),
        clearReview: true,
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function approve() {
    startTransition(async () => {
      const result = await clearReviewFlag([id]);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1.5">
        {suggestions
          .filter((s) => String(s) !== currentPrice)
          .map((price) => (
            <button
              key={price}
              onClick={() => apply(price)}
              disabled={pending}
              className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              Use ₹{price.toLocaleString("en-IN")}
            </button>
          ))}
        <button
          onClick={approve}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-ink-200 transition hover:bg-white/[0.07] disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Price is right
        </button>
      </div>
      {error && <span className="text-[11px] text-rose-300">{error}</span>}
    </div>
  );
}
