"use client";

import { useSyncExternalStore, useCallback } from "react";

const STORAGE_KEY = "torque_bookmarks";

function getSnapshot(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getServerSnapshot(): string[] {
  return [];
}

let cachedIds: string[] = getSnapshot();
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  cachedIds = getSnapshot();
  listeners.forEach((cb) => cb());
}

function snapshotAccessor() {
  return cachedIds;
}

export function useBookmarks() {
  const ids = useSyncExternalStore(subscribe, snapshotAccessor, getServerSnapshot);

  const toggle = useCallback((id: string) => {
    const current = getSnapshot();
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [id, ...current];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notify();
  }, []);

  const isBookmarked = useCallback(
    (id: string) => ids.includes(id),
    [ids],
  );

  return { ids, toggle, isBookmarked, count: ids.length };
}
