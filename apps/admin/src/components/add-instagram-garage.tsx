"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AtSign, Loader2, Search } from "lucide-react";
import {
  previewInstagramGarage,
  createInstagramGarage,
  type SuggestedGarage,
} from "@/lib/onboarding-actions";

/**
 * Preview-then-confirm, deliberately.
 *
 * Fetching an Instagram profile costs a few seconds of headless-browser time
 * and sometimes comes back thin (private account, rate limit, expired session),
 * so the operator sees what we found and can fix it before anything is written.
 * The existing hand-seeded garages all have the handle repeated as the display
 * name — this is what stops that happening again.
 */
export function AddInstagramGarage() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [draft, setDraft] = useState<SuggestedGarage | null>(null);
  const [followers, setFollowers] = useState<number | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [scrapeNow, setScrapeNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function lookup() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await previewInstagramGarage(handle);
      if (!result.ok) {
        setError(result.error);
        setDraft(null);
        return;
      }
      setDraft(result.suggested);
      setFollowers(result.profile.followers);
      setIsPrivate(result.profile.isPrivate);
    });
  }

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const result = await createInstagramGarage({ ...draft, scrapeNow });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        result.note ??
          `${result.created ? "Created" : "Updated"} /${result.slug}${
            result.scrapeQueued ? " and queued a scrape." : "."
          }`,
      );
      setDraft(null);
      setHandle("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <AtSign className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                lookup();
              }
            }}
            placeholder="handle or instagram.com/handle"
            className="field pl-9"
          />
        </div>
        <button
          onClick={lookup}
          disabled={pending || !handle.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-ink-200 transition hover:bg-white/[0.07] disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Look up
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {notice}
        </p>
      )}

      {draft && (
        <div className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-3">
            {draft.logoUrl ? (
              <Image
                src={draft.logoUrl}
                alt=""
                width={48}
                height={48}
                unoptimized
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-xs text-ink-500">
                ?
              </span>
            )}
            <div className="min-w-0 text-xs">
              <p className="font-semibold text-ink-100">@{draft.handle}</p>
              <p className="text-ink-500">
                {followers != null
                  ? `${followers.toLocaleString("en-IN")} followers`
                  : "follower count unavailable"}
                {isPrivate && " · private account"}
              </p>
            </div>
          </div>

          {isPrivate && (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              This account is private. It can be saved, but scrapes will return
              nothing until the scraper&apos;s session follows it.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Display name"
              value={draft.name}
              onChange={(v) => setDraft({ ...draft, name: v })}
            />
            <Field
              label="Slug"
              value={draft.slug}
              onChange={(v) => setDraft({ ...draft, slug: v })}
            />
            <Field
              label="City"
              value={draft.city ?? ""}
              onChange={(v) => setDraft({ ...draft, city: v || null })}
            />
            <Field
              label="Phone"
              value={draft.phone ?? ""}
              onChange={(v) => setDraft({ ...draft, phone: v || null })}
            />
          </div>

          <div>
            <label className="field-label">Description</label>
            <textarea
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
              className="field resize-y"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-ink-300">
            <input
              type="checkbox"
              checked={scrapeNow}
              onChange={(e) => setScrapeNow(e.target.checked)}
              className="accent-orange-500"
            />
            Queue a scrape of this handle immediately
          </label>

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-gradient px-3 py-2 text-xs font-bold text-ink-950 transition hover:opacity-90 disabled:opacity-50"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save garage
            </button>
            <button
              onClick={() => setDraft(null)}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-ink-300 hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="field" />
    </div>
  );
}
