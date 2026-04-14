"use client";

import { Heart } from "lucide-react";
import { useBookmarks } from "@/app/lib/use-bookmarks";

export function BookmarkButton({
  listingId,
  size = "sm",
}: {
  listingId: string;
  size?: "sm" | "md";
}) {
  const { toggle, isBookmarked } = useBookmarks();
  const active = isBookmarked(listingId);

  const dim = size === "md" ? "h-10 w-10" : "h-8 w-8";
  const iconDim = size === "md" ? "h-5 w-5" : "h-4 w-4";

  return (
    <button
      type="button"
      aria-label={active ? "Remove from saved" : "Save listing"}
      {...(active ? { "data-bookmarked": "" } : {})}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(listingId);
      }}
      className={`flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-200 ${dim} ${
        active
          ? "bg-rose-500/20 text-rose-400 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/30"
          : "bg-ink-950/60 text-ink-300 ring-1 ring-inset ring-white/10 hover:bg-ink-950/80 hover:text-ink-50"
      }`}
    >
      <Heart
        className={`${iconDim} transition-transform duration-200 ${active ? "scale-110 fill-current" : ""}`}
        strokeWidth={active ? 2.5 : 2}
      />
    </button>
  );
}
