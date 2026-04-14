"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useBookmarks } from "@/app/lib/use-bookmarks";

export function SavedNavLink() {
  const { count } = useBookmarks();

  return (
    <Link
      href="/saved"
      className="relative rounded-md px-3 py-1.5 text-sm font-medium text-ink-400 transition hover:bg-white/5 hover:text-ink-50"
    >
      <span className="flex items-center gap-1.5">
        <Heart className="h-3.5 w-3.5" strokeWidth={2} />
        Saved
        {count > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500/20 px-1 font-mono text-[10px] font-bold text-rose-300 ring-1 ring-inset ring-rose-500/30">
            {count}
          </span>
        )}
      </span>
    </Link>
  );
}
