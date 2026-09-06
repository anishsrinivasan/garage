"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * The app previously had no error boundary at all, so a database hiccup during
 * a render produced Next's default full-page error rather than something a
 * visitor could recover from.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[torque] render error", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-rose-500/20 bg-rose-500/[0.03] py-24 text-center">
      <AlertTriangle className="h-8 w-8 text-rose-300" strokeWidth={1.5} />
      <div>
        <h2 className="font-display text-xl font-bold text-ink-100">
          Something went wrong loading listings.
        </h2>
        <p className="mt-1 max-w-md text-sm text-ink-500">
          This is usually temporary. Try again, and if it keeps happening the
          data source may be down.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-ink-600">
            ref {error.digest}
          </p>
        )}
      </div>
      <button
        onClick={reset}
        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent/10"
      >
        <RotateCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}
