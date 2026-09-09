"use client";

import { useEffect, useState, useTransition } from "react";
import { Heart, ArrowLeft, Car, Home, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { useBookmarks } from "@/app/lib/use-bookmarks";
import { usePreview } from "@/app/lib/use-preview";
import { ListingCard } from "@/app/components/listing-card";
import { RentalCard } from "@/app/components/rental-card";
import { ListingPreview } from "@/app/components/listing-preview";
import { fetchSavedListings } from "./actions";

type Listing = Parameters<typeof ListingCard>[0]["listing"];
type Rental = Parameters<typeof RentalCard>[0]["listing"];

const VERTICALS = ["all", "cars", "rentals"] as const;
type Vertical = (typeof VERTICALS)[number];

const TABS: { key: Vertical; label: string; icon: typeof Car }[] = [
  { key: "all", label: "All", icon: LayoutGrid },
  { key: "cars", label: "Cars", icon: Car },
  { key: "rentals", label: "Rentals", icon: Home },
];

export function SavedListings() {
  const { ids, count } = useBookmarks();
  const { open: openPreview } = usePreview();
  const [vertical, setVertical] = useQueryState(
    "type",
    parseAsStringLiteral(VERTICALS).withDefault("all").withOptions({ history: "replace" }),
  );
  const [listings, setListings] = useState<Listing[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (ids.length === 0) {
      setListings([]);
      setRentals([]);
      setOrder([]);
      setLoaded(true);
      return;
    }
    startTransition(async () => {
      const data = await fetchSavedListings(ids);
      setListings(data.cars as Listing[]);
      setRentals(data.rentals as Rental[]);
      setOrder(data.order);
      setLoaded(true);
    });
  }, [ids]);

  const shown = order.filter((id) =>
    vertical === "cars"
      ? listings.some((l) => l.id === id)
      : vertical === "rentals"
        ? rentals.some((r) => r.id === id)
        : true,
  );

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
          {count} listing{count !== 1 ? "s" : ""} saved
        </p>

        {/* Saved mixes both verticals — a car and a flat are not comparable, so
            the list is worth splitting once there is more than one kind in it. */}
        {loaded && listings.length > 0 && rentals.length > 0 && (
          <div className="mt-5 flex w-fit items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
            {TABS.map(({ key, label, icon: Icon }) => {
              const n =
                key === "cars"
                  ? listings.length
                  : key === "rentals"
                    ? rentals.length
                    : listings.length + rentals.length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setVertical(key)}
                  aria-pressed={vertical === key}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    vertical === key
                      ? "bg-white/[0.07] text-ink-100"
                      : "text-ink-500 hover:text-ink-300"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  <span className="font-mono text-[10px] text-ink-600">{n}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!loaded || isPending ? (
        <div className="grid animate-pulse grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: Math.min(count || 3, 6) }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/2] rounded-2xl border border-white/[0.06] bg-ink-850/40"
            />
          ))}
        </div>
      ) : listings.length === 0 && rentals.length === 0 ? (
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
          {shown.map((id) => {
            const car = listings.find((l) => l.id === id);
            if (car)
              return <ListingCard key={id} listing={car} onPreview={openPreview} />;
            const rental = rentals.find((r) => r.id === id);
            return rental ? (
              <RentalCard key={id} listing={rental} onPreview={openPreview} />
            ) : null;
          })}
        </div>
      )}

      <ListingPreview />
    </div>
  );
}
