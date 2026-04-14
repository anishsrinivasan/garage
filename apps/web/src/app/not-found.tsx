import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
        Error 404
      </p>
      <h1 className="mt-4 font-display text-5xl font-bold tracking-tight text-gradient">
        Off the road
      </h1>
      <p className="mt-3 max-w-md text-sm text-ink-400">
        The listing you&apos;re looking for may have been sold, delisted, or
        never existed.
      </p>
      <Link
        href="/"
        className="btn-accent mt-8"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to listings
      </Link>
    </div>
  );
}
