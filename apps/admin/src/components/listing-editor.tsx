"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { updateListing } from "@/lib/actions";

type Listing = {
  id: string;
  make: string;
  model: string;
  variant: string | null;
  year: number;
  price: string | null;
  kmDriven: number | null;
  fuelType: string | null;
  transmission: string | null;
  bodyType: string | null;
  city: string;
  saleStatus: string;
  needsReview: boolean;
};

export function ListingEditor({ listing }: { listing: Listing }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const num = (key: string) => {
      const raw = form.get(key);
      if (raw == null || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    startTransition(async () => {
      const result = await updateListing(listing.id, {
        make: String(form.get("make") ?? ""),
        model: String(form.get("model") ?? ""),
        variant: (form.get("variant") as string) || null,
        year: num("year") ?? listing.year,
        price: (form.get("price") as string) ?? null,
        kmDriven: num("kmDriven"),
        fuelType: (form.get("fuelType") as string) || null,
        transmission: (form.get("transmission") as string) || null,
        bodyType: (form.get("bodyType") as string) || null,
        city: (form.get("city") as string) || null,
        saleStatus: String(form.get("saleStatus") ?? listing.saleStatus),
        clearReview: form.get("clearReview") === "on",
      });
      setMessage(
        result.ok
          ? { text: result.message ?? "Saved", ok: true }
          : { text: result.error, ok: false },
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Make" name="make" defaultValue={listing.make} />
        <Field label="Model" name="model" defaultValue={listing.model} />
      </div>
      <Field label="Variant" name="variant" defaultValue={listing.variant ?? ""} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Year" name="year" type="number" defaultValue={String(listing.year)} />
        {/* Accepts "45 lakhs" or "₹45L" as well as a raw number, parsed by the
            same code the scraper uses — so a correction here can't reintroduce
            the lakh/crore confusion. */}
        <Field
          label="Price"
          name="price"
          defaultValue={listing.price ?? ""}
          hint="45 lakhs, ₹45L, or 4500000"
        />
        <Field
          label="Km driven"
          name="kmDriven"
          type="number"
          defaultValue={listing.kmDriven != null ? String(listing.kmDriven) : ""}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Select
          label="Fuel"
          name="fuelType"
          defaultValue={listing.fuelType ?? ""}
          options={["", "petrol", "diesel", "cng", "electric", "hybrid", "lpg"]}
        />
        <Select
          label="Transmission"
          name="transmission"
          defaultValue={listing.transmission ?? ""}
          options={["", "manual", "automatic"]}
        />
        <Select
          label="Body"
          name="bodyType"
          defaultValue={listing.bodyType ?? ""}
          options={[
            "",
            "hatchback",
            "sedan",
            "suv",
            "muv",
            "coupe",
            "convertible",
            "pickup",
            "van",
            "wagon",
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" name="city" defaultValue={listing.city} />
        <Select
          label="Sale status"
          name="saleStatus"
          defaultValue={listing.saleStatus}
          options={["available", "sold", "removed"]}
        />
      </div>

      {listing.needsReview && (
        <label className="flex items-center gap-2 text-xs text-ink-300">
          <input type="checkbox" name="clearReview" defaultChecked className="accent-orange-500" />
          Clear the review flag (re-applied automatically if the price is still
          implausible)
        </label>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-gradient px-3 py-2 text-xs font-bold text-ink-950 transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </button>
        {message && (
          <span className={`text-[11px] ${message.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} type={type} defaultValue={defaultValue} className="field" />
      {hint && <p className="mt-1 text-[10px] text-ink-600">{hint}</p>}
    </div>
  );
}

function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: string[];
}) {
  return (
    <div>
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} defaultValue={defaultValue} className="field capitalize">
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt || "—"}
          </option>
        ))}
      </select>
    </div>
  );
}
