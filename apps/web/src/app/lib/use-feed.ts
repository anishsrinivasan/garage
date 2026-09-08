"use client";

/**
 * Feed data for the cars and rentals grids.
 *
 * The query key is the raw query string, so every filter, sort and page change
 * is a distinct entry and going back to a previous combination is instant while
 * it refetches underneath.
 */
import { useQuery } from "@tanstack/react-query";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    // The route answers 502 with a body when the database is unreachable; the
    // message is deliberately not shown to the visitor, only logged.
    throw new Error(`Request failed with ${res.status}`);
  }
  return (await res.json()) as T;
}

export type FeedResponse<TItem> = {
  listings: TItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  takenHidden?: number;
};

export function useFeed<TItem>(path: "/api/listings" | "/api/rentals", queryString: string) {
  return useQuery({
    queryKey: [path, queryString],
    queryFn: () => fetchJson<FeedResponse<TItem>>(`${path}?${queryString}`),
  });
}
