import { ListingCardSkeleton } from "@/app/components/listing-card";

export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-10 h-64 rounded-2xl border border-white/[0.06] bg-ink-900/40" />
      <div className="lg:flex lg:gap-8">
        <div className="mb-6 h-96 shrink-0 rounded-2xl bg-white/[0.02] lg:mb-0 lg:w-72" />
        <div className="min-w-0 flex-1">
          <div className="mb-6 h-8 w-52 rounded bg-white/[0.05]" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ListingCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
