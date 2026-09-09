"use client";

/**
 * Listings the visitor has swiped away.
 *
 * Deliberately the same shape and storage as bookmarks — per-viewer, in the
 * browser, never sent anywhere. A dismissal is a preference, not an opinion
 * about the listing, so it has no business in the database where it would
 * follow the listing around for everyone.
 *
 * Kept separate from bookmarks rather than modelled as one tri-state, because
 * the two answer different questions: "show me this again" and "I want to come
 * back to this" are independent. A saved listing that later gets swiped away
 * should still be in the saved list.
 *
 * Scoped per vertical. The two feeds never show each other's listings, so a
 * shared store would have the cars page offering to bring back flats — and
 * "restore everything" on one feed would silently reset the other.
 */
import { useSyncExternalStore, useCallback, useMemo } from "react";

export type DismissScope = "cars" | "rentals";

const storageKey = (scope: DismissScope) => `classifieds_dismissed_${scope}`;
/** Enough to stop repeats without letting one browser hoard the catalogue. */
const MAX_REMEMBERED = 500;

function read(scope: DismissScope): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(scope));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * One store per scope, created on demand. useSyncExternalStore compares
 * snapshots by identity, so each scope needs its own cached array — returning a
 * freshly-filtered list on every call would re-render forever.
 */
const stores = new Map<
  DismissScope,
  {
    cached: string[];
    listeners: Set<() => void>;
    subscribe: (cb: () => void) => () => void;
    snapshot: () => string[];
  }
>();

function storeFor(scope: DismissScope) {
  let store = stores.get(scope);
  if (!store) {
    const listeners = new Set<() => void>();
    store = {
      cached: read(scope),
      listeners,
      subscribe: (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      snapshot: () => stores.get(scope)!.cached,
    };
    stores.set(scope, store);
  }
  return store;
}

function notify(scope: DismissScope) {
  const store = storeFor(scope);
  store.cached = read(scope);
  store.listeners.forEach((cb) => cb());
}

const EMPTY: string[] = [];
function serverSnapshot(): string[] {
  return EMPTY;
}

export function useDismissed(scope: DismissScope) {
  const store = storeFor(scope);
  const ids = useSyncExternalStore(store.subscribe, store.snapshot, serverSnapshot);

  const dismiss = useCallback(
    (id: string) => {
      const next = [id, ...read(scope).filter((x) => x !== id)].slice(0, MAX_REMEMBERED);
      try {
        localStorage.setItem(storageKey(scope), JSON.stringify(next));
      } catch {
        // A full or blocked store is not worth failing a swipe over; the card
        // still leaves the deck for this session.
      }
      notify(scope);
    },
    [scope],
  );

  const restoreAll = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(scope));
    } catch {
      /* nothing to undo */
    }
    notify(scope);
  }, [scope]);

  // A Set rather than Array.includes: the feed tests every listing on the page
  // against this on each render.
  const dismissedSet = useMemo(() => new Set(ids), [ids]);
  const isDismissed = useCallback((id: string) => dismissedSet.has(id), [dismissedSet]);

  return { ids, dismiss, restoreAll, isDismissed, count: ids.length };
}
