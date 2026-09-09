/**
 * The saved list reads its vertical filter from the query string, and
 * `useSearchParams` in a client component has to sit under a Suspense boundary
 * or the build refuses to prerender this route at all.
 */
import { Suspense } from "react";
import { SavedListings } from "./saved-listings";

export const metadata = {
  title: "Saved Listings",
  description: "The cars and rentals you have saved.",
};

export default function SavedPage() {
  return (
    <Suspense fallback={<div className="py-20" />}>
      <SavedListings />
    </Suspense>
  );
}
