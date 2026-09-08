"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { addAliases } from "@/lib/geography-actions";

/**
 * Location strings from listings that matched no locality.
 *
 * Each one is either a missing alias or a missing locality — a concrete work
 * queue rather than a quality score. Assigning one adds it as an alias, so the
 * same spelling resolves automatically from then on.
 */
export function UnmatchedLocations({
  cityId,
  rows,
  localities,
}: {
  cityId: string;
  rows: Array<{ locationText: string; count: number }>;
  localities: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  function assign(text: string, localityId: string) {
    startTransition(async () => {
      const r = await addAliases(localityId, text);
      setNotice(r.ok ? r.message : r.error);
      if (r.ok) {
        setAssigning(null);
        router.refresh();
      }
    });
  }

  if (rows.length === 0) {
    return <p className="text-xs text-emerald-300">Every listing resolved to a locality.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-ink-500">
        {rows.length} unresolved. Assigning one adds it as an alias, so it resolves
        by itself next time.
      </p>
      {notice && <p className="text-[11px] text-emerald-300">{notice}</p>}

      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.locationText} className="rounded border border-white/5 px-2 py-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-ink-200" title={row.locationText}>
                {row.locationText}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="font-mono text-[10px] text-ink-500">{row.count}</span>
                <button
                  onClick={() =>
                    setAssigning(assigning === row.locationText ? null : row.locationText)
                  }
                  className="rounded border border-white/10 p-1 text-ink-400 hover:bg-white/5 hover:text-ink-100"
                  title="Assign to a locality"
                >
                  <ArrowRight className="h-3 w-3" />
                </button>
              </span>
            </div>

            {assigning === row.locationText && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && assign(row.locationText, e.target.value)}
                  className="field py-1 text-[11px]"
                >
                  <option value="">Add as alias of…</option>
                  {localities.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                {pending && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
