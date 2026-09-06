"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { upsertGarage } from "@/lib/actions";

type Garage = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  city: string | null;
  phone: string | null;
  description: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  logoUrl: string | null;
  isActive: boolean;
};

export function GarageEditor({ garage }: { garage: Garage }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const str = (key: string) => (form.get(key) as string) || null;

    startTransition(async () => {
      const result = await upsertGarage({
        id: garage.id,
        name: String(form.get("name") ?? ""),
        slug: String(form.get("slug") ?? ""),
        city: str("city"),
        phone: str("phone"),
        description: str("description"),
        websiteUrl: str("websiteUrl"),
        instagramUrl: str("instagramUrl"),
        logoUrl: str("logoUrl"),
        kind: String(form.get("kind") ?? garage.kind),
        isActive: form.get("isActive") === "on",
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" name="name" defaultValue={garage.name} />
        <Field label="Slug" name="slug" defaultValue={garage.slug} />
        <Field label="City" name="city" defaultValue={garage.city ?? ""} />
        <Field label="Phone" name="phone" defaultValue={garage.phone ?? ""} />
        <Field label="Website" name="websiteUrl" defaultValue={garage.websiteUrl ?? ""} />
        <Field
          label="Instagram"
          name="instagramUrl"
          defaultValue={garage.instagramUrl ?? ""}
        />
        <Field label="Logo URL" name="logoUrl" defaultValue={garage.logoUrl ?? ""} />
        <div>
          <label className="field-label" htmlFor={`kind-${garage.id}`}>
            Kind
          </label>
          <select
            id={`kind-${garage.id}`}
            name="kind"
            defaultValue={garage.kind}
            className="field"
          >
            <option value="dealer">dealer</option>
            <option value="marketplace">marketplace</option>
          </select>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor={`desc-${garage.id}`}>
          Description
        </label>
        <textarea
          id={`desc-${garage.id}`}
          name="description"
          rows={2}
          defaultValue={garage.description ?? ""}
          className="field resize-y"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-ink-300">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={garage.isActive}
          className="accent-orange-500"
        />
        Active (inactive garages are hidden from the public site and skipped by
        scrapes)
      </label>

      <div className="flex items-center gap-3">
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
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input name={name} defaultValue={defaultValue} className="field" />
    </div>
  );
}
