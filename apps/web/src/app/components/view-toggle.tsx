"use client";

/**
 * Grid ⇄ Swipe switch, shared by both feeds.
 *
 * The passed-count link lives here rather than in each feed because a visitor
 * who swiped away half the page has no other way back to those listings — the
 * dismissals are per-browser and invisible in the grid.
 */
import { LayoutGrid, Layers } from "lucide-react";

export type FeedMode = "grid" | "swipe";

export function ViewToggle({
  mode,
  onChange,
  dismissedCount,
  onRestore,
}: {
  mode: FeedMode;
  onChange: (mode: FeedMode) => void;
  dismissedCount: number;
  onRestore: () => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex w-fit items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
        {(["grid", "swipe"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={mode === m}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              mode === m
                ? "bg-white/[0.07] text-ink-100"
                : "text-ink-500 hover:text-ink-300"
            }`}
          >
            {m === "grid" ? (
              <LayoutGrid className="h-3.5 w-3.5" />
            ) : (
              <Layers className="h-3.5 w-3.5" />
            )}
            {m === "grid" ? "Grid" : "Swipe"}
          </button>
        ))}
      </div>

      {mode === "swipe" && dismissedCount > 0 && (
        <button
          type="button"
          onClick={onRestore}
          className="text-xs text-ink-500 underline-offset-4 transition hover:text-ink-300 hover:underline"
        >
          Bring back {dismissedCount} passed
        </button>
      )}
    </div>
  );
}
