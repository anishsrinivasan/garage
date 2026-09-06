"use client";

import { useTransition } from "react";
import { EyeOff, Eye, Loader2 } from "lucide-react";
import { setListingActive } from "@/lib/actions";

export function ListingRowActions({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await setListingActive([id], !isActive);
        })
      }
      disabled={pending}
      title={isActive ? "Delist" : "Restore"}
      className="rounded-md border border-white/10 p-1.5 text-ink-400 transition hover:bg-white/5 hover:text-ink-100 disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isActive ? (
        <EyeOff className="h-3.5 w-3.5" />
      ) : (
        <Eye className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
