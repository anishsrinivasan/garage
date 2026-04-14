"use client";

import { useEffect, useState, useTransition } from "react";
import { Heart, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useBookmarks } from "@/app/lib/use-bookmarks";
import { ListingCard } from "@/app/components/listing-card";
import { fetchSavedListings } from "./actions";

type Listing = Parameters<typeof ListingCard>[0]["listing"];

export default function SavedPage() {
  const { ids, count } = useBookmarks();
  const [listings, setListings] = useState<Listing[]>([]);
  const [isPending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (ids.length === 0) {
      setListings([]);
      setLoaded(true);
      return;
    }
    startTransition(async () => {
      const data = await fetchSavedListings(ids);
      setListings(data as Listing[]);
      setLoaded(true);
    });
  }, [ids]);

  return (
    <div className="animate-fade-in-up">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to listings
      </Link>

      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-ink-300">
          <Heart className="h-3 w-3 text-rose-400" />
          <span className="font-mono uppercase tracking-[0.18em]">
            Your collection
          </span>
        </div>

        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Saved Listings
        </h1>
        <p className="mt-2 text-sm text-ink-400">
          {count} car{count !== 1 ? "s" : ""} saved
        </p>
      </div>

      {!loaded || isPending ? (
        <div className="grid animate-pulse grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: Math.min(count || 3, 6) }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/3] rounded-2xl border border-white/[0.06] bg-ink-850/40"
            />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center">
          <Heart className="h-10 w-10 text-ink-600" strokeWidth={1.3} />
          <p className="font-display text-lg font-semibold text-ink-200">
            No saved listings yet
          </p>
          <p className="max-w-sm text-sm text-ink-500">
            Tap the heart icon on any listing to save it here for quick access.
          </p>
          <Link
            href="/"
            className="mt-4 rounded-lg border border-accent/20 bg-accent/5 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
          >
            Browse listings
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
