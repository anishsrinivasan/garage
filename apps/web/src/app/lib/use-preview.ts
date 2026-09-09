"use client";

/**
 * Which listing the preview dialog is showing, kept in the URL.
 *
 * In the URL rather than in component state so the dialog survives a reload,
 * closes on the back button, and can be linked to — `/rent?preview=<id>` opens
 * the feed with that flat already up. The dedicated page stays the canonical
 * address for a listing; this is the same listing seen without leaving the feed.
 */
import { useQueryState, parseAsString } from "nuqs";

export function usePreview() {
  const [previewId, setPreviewId] = useQueryState(
    "preview",
    // history: "push" so Back closes the dialog rather than leaving the feed.
    parseAsString.withOptions({ history: "push", scroll: false }),
  );

  return {
    previewId,
    open: (id: string) => setPreviewId(id),
    close: () => setPreviewId(null),
  };
}
