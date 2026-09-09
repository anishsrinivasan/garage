"use client";

/**
 * City selector for the header.
 *
 * Chennai is the only city with inventory, so the others exist to answer a
 * question rather than to be chosen: someone landing here wants to know whether
 * their city is covered, and a picker showing only Chennai reads as a bug or an
 * oversight. Naming the cities and saying plainly that they are not served yet
 * is more honest than pretending the choice does not exist — and it is the one
 * place a visitor will tell us where they actually want to look.
 *
 * The unserved cities are the metros an Indian renter or buyer would try first,
 * not an exhaustive list; picking one leaves the catalogue alone.
 */

import { useEffect, useRef, useState } from "react";
import { MapPin, Check, ChevronDown } from "lucide-react";

const SERVED = "Chennai";
const NOT_YET = [
  "Bengaluru",
  "Hyderabad",
  "Mumbai",
  "Delhi NCR",
  "Pune",
  "Coimbatore",
];

export function CityPicker() {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-ink-200 transition hover:bg-white/[0.07]"
      >
        <MapPin className="h-3.5 w-3.5 text-accent" />
        {SERVED}
        <ChevronDown
          className={`h-3 w-3 text-ink-500 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-ink-900/95 shadow-2xl backdrop-blur-xl"
        >
          <button
            role="option"
            aria-selected
            onClick={() => {
              setAsked(null);
              setOpen(false);
            }}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-ink-100 transition hover:bg-white/[0.05]"
          >
            {SERVED}
            <Check className="h-4 w-4 text-accent" />
          </button>

          <div className="border-t border-white/5 px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-600">
            Not yet
          </div>

          {NOT_YET.map((city) => (
            <button
              key={city}
              role="option"
              aria-selected={false}
              onClick={() => setAsked(city)}
              className="block w-full px-3 py-2 text-left text-sm text-ink-500 transition hover:bg-white/[0.04] hover:text-ink-300"
            >
              {city}
            </button>
          ))}

          {asked && (
            <p className="border-t border-white/5 bg-accent/[0.06] px-3 py-2.5 text-xs leading-relaxed text-ink-300">
              We only cover <span className="text-ink-100">Chennai</span> for
              now — every listing here is scraped from Chennai dealers and
              brokers. {asked} isn&apos;t served yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
