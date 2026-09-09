"use client";

/**
 * A card deck you sort by swiping: right to save, left to pass.
 *
 * Built on pointer events rather than a gesture library — one draggable card at
 * a time is not enough behaviour to justify the dependency, and pointer events
 * cover mouse, touch and pen in one path.
 *
 * The deck renders three cards at most. Anything deeper is invisible under the
 * top card, and mounting the whole result set would load a hundred images to
 * show three.
 *
 * Position is tracked as the set of ids already decided, not as an index into
 * `items`. The caller hides passed listings, so `items` shrinks under the deck
 * on every left swipe — an index would step over the card that slid into the
 * gap, and only on passes, so every pass would silently skip a listing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart, X, RotateCcw, Undo2 } from "lucide-react";

/** Past this, releasing commits the swipe rather than springing back. */
const COMMIT_DISTANCE = 110;
/** A fast flick commits even if it never travelled far. */
const COMMIT_VELOCITY = 0.45;

export type SwipeDecision = "save" | "pass";

export function SwipeDeck<T extends { id: string }>({
  items,
  renderCard,
  onDecide,
  onExhausted,
  emptyMessage,
}: {
  items: T[];
  renderCard: (item: T) => React.ReactNode;
  onDecide: (item: T, decision: SwipeDecision) => void;
  onExhausted?: () => void;
  emptyMessage: string;
}) {
  const [decided, setDecided] = useState<string[]>([]);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [leaving, setLeaving] = useState<SwipeDecision | null>(null);
  const [history, setHistory] = useState<{ item: T; decision: SwipeDecision }[]>([]);

  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Each card is a link to its detail page. A drag ends with a click on that
  // link, so a swipe would navigate away mid-gesture unless the click that
  // follows a real drag is swallowed. A tap still opens the listing.
  const dragged = useRef(false);

  const queue = useMemo(() => {
    const seen = new Set(decided);
    return items.filter((item) => !seen.has(item.id));
  }, [items, decided]);
  const current = queue[0];
  const upcoming = queue.slice(1, 3);

  const commit = useCallback(
    (decision: SwipeDecision) => {
      if (!current) return;
      setLeaving(decision);
      // Let the card clear the viewport before the next one takes its place;
      // swapping immediately reads as a flicker rather than a throw.
      window.setTimeout(() => {
        onDecide(current, decision);
        setHistory((h) => [{ item: current, decision }, ...h].slice(0, 20));
        setDecided((d) => [...d, current.id]);
        setDrag({ x: 0, y: 0 });
        setLeaving(null);
      }, 220);
    },
    [current, onDecide],
  );

  // Undo only puts the card back on the deck. Reversing the caller's side of
  // the decision is its own concern — a passed listing it hid stays hidden
  // until the "bring back" control restores it.
  const undo = useCallback(() => {
    const [last, ...rest] = history;
    if (!last) return;
    setHistory(rest);
    setDecided((d) => d.filter((id) => id !== last.item.id));
    setDrag({ x: 0, y: 0 });
  }, [history]);

  // Keyboard is not an afterthought here: a deck that only responds to dragging
  // is unusable without a pointer, and arrow keys are what people try.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "")) {
        return;
      }
      if (e.key === "ArrowRight") commit("save");
      else if (e.key === "ArrowLeft") commit("pass");
      else if (e.key === "Backspace") {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, undo]);

  useEffect(() => {
    if (current == null && decided.length > 0) onExhausted?.();
  }, [current, decided.length, onExhausted]);

  function onPointerDown(e: React.PointerEvent) {
    if (leaving) return;
    dragged.current = false;
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    cardRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current || leaving) return;
    const x = e.clientX - start.current.x;
    const y = e.clientY - start.current.y;
    if (Math.abs(x) > 6 || Math.abs(y) > 6) dragged.current = true;
    setDrag({ x, y });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!start.current || leaving) return;
    const dx = e.clientX - start.current.x;
    const velocity = Math.abs(dx) / Math.max(1, Date.now() - start.current.t);
    start.current = null;
    cardRef.current?.releasePointerCapture(e.pointerId);

    if (Math.abs(dx) > COMMIT_DISTANCE || velocity > COMMIT_VELOCITY) {
      commit(dx > 0 ? "save" : "pass");
    } else {
      setDrag({ x: 0, y: 0 });
    }
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-24 text-center">
        <p className="font-display text-lg font-semibold text-ink-200">
          {decided.length === 0 ? emptyMessage : "That's everything."}
        </p>
        <p className="max-w-sm text-sm text-ink-500">
          {decided.length === 0
            ? "Try widening the filters."
            : `You went through ${decided.length} listing${decided.length === 1 ? "" : "s"}.`}
        </p>
        {history.length > 0 && (
          <button
            onClick={() => {
              setDecided([]);
              setHistory([]);
            }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-ink-200 transition hover:bg-white/[0.07]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Start over
          </button>
        )}
      </div>
    );
  }

  const rotation = drag.x / 18;
  const intent = drag.x > 60 ? "save" : drag.x < -60 ? "pass" : null;
  const flyX = leaving === "save" ? 700 : leaving === "pass" ? -700 : drag.x;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-sm select-none">
        {/* Depth: the next couple of cards peek out behind the live one. */}
        {upcoming
          .map((item, i) => (
            <div
              key={item.id}
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                transform: `scale(${1 - (i + 1) * 0.05}) translateY(${(i + 1) * 22}px)`,
                opacity: 1 - (i + 1) * 0.3,
                zIndex: 10 - (i + 1),
              }}
            >
              {renderCard(item)}
            </div>
          ))
          .reverse()}

        <div
          key={current.id}
          ref={cardRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={(e) => {
            if (dragged.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onDragStart={(e) => e.preventDefault()}
          role="group"
          aria-label="Swipe right to save, left to pass"
          className="relative cursor-grab rounded-2xl shadow-2xl active:cursor-grabbing [&_img]:pointer-events-none"
          style={{
            transform: `translate(${flyX}px, ${leaving ? -40 : drag.y * 0.25}px) rotate(${leaving ? (leaving === "save" ? 22 : -22) : rotation}deg)`,
            opacity: leaving ? 0 : 1,
            transition: start.current
              ? "none"
              : "transform 220ms cubic-bezier(.22,.61,.36,1), opacity 220ms ease",
            zIndex: 20,
            touchAction: "pan-y",
          }}
        >
          {renderCard(current)}

          {/* The verdict appears as you drag, so the gesture is legible before
              you let go rather than after. */}
          <div
            className="pointer-events-none absolute left-4 top-4 rounded-lg border-2 border-emerald-400 px-3 py-1 font-display text-lg font-bold uppercase tracking-wider text-emerald-400"
            style={{ opacity: intent === "save" ? 1 : 0, transform: "rotate(-12deg)" }}
          >
            Save
          </div>
          <div
            className="pointer-events-none absolute right-4 top-4 rounded-lg border-2 border-rose-400 px-3 py-1 font-display text-lg font-bold uppercase tracking-wider text-rose-400"
            style={{ opacity: intent === "pass" ? 1 : 0, transform: "rotate(12deg)" }}
          >
            Pass
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => commit("pass")}
          aria-label="Pass"
          className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-rose-400 transition hover:scale-105 hover:bg-rose-500/10 active:scale-95"
        >
          <X className="h-6 w-6" />
        </button>
        <button
          onClick={undo}
          disabled={history.length === 0}
          aria-label="Undo last swipe"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-ink-400 transition hover:bg-white/[0.07] disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={() => commit("save")}
          aria-label="Save"
          className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-emerald-400 transition hover:scale-105 hover:bg-emerald-500/10 active:scale-95"
        >
          <Heart className="h-6 w-6" />
        </button>
      </div>

      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-600">
        {queue.length} left · drag, or use ← →
      </p>
    </div>
  );
}
