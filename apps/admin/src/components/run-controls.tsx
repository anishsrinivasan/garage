"use client";

import { useState, useTransition } from "react";
import { Play, Loader2, Wrench } from "lucide-react";
import { startScrape, startMaintenance } from "@/lib/run-actions";

/**
 * Trigger buttons for the cron service. Runs are queued, not awaited — a full
 * scrape takes minutes — so the feedback here is "queued", and the run's real
 * outcome shows up in the runs table.
 */
export function RunControls() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(
        result.ok
          ? { text: "Queued. Watch the runs table for the result.", ok: true }
          : { text: result.error ?? "Failed to queue", ok: false },
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => run(() => startScrape())}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-gradient px-3 py-2 text-xs font-bold text-ink-950 transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
          Run scrape
        </button>
        <button
          onClick={() => run(() => startMaintenance())}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-ink-200 transition hover:bg-white/[0.07] disabled:opacity-50"
        >
          <Wrench className="h-3.5 w-3.5" />
          Sweep
        </button>
      </div>
      {message && (
        <p
          className={`text-[11px] ${message.ok ? "text-emerald-300" : "text-rose-300"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
