"use client";

/**
 * TanStack Query client.
 *
 * Built inside a `useState` initialiser rather than at module scope: a module
 * level client is shared by every request the server handles, which leaks one
 * visitor's data into another's cache.
 *
 * Nothing is cached across page loads on purpose — `staleTime: 0` means a
 * revisit refetches. The listings behind these queries change whenever a scrape
 * runs, and showing a flat that was taken an hour ago is worse than a spinner.
 */
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 0,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
