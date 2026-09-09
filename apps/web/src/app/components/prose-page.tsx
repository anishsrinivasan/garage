/**
 * Shell for the standing pages — terms, privacy, the MCP notes.
 *
 * These are read once and referred back to, so they are set narrow and quiet
 * rather than given the feed's density. No client behaviour here on purpose.
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function ProsePage({
  eyebrow,
  title,
  standfirst,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  standfirst: string;
  /** ISO date. Shown so a reader can tell how current this is. */
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="animate-fade-in-up mx-auto max-w-2xl">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to listings
      </Link>

      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-500">
        {eyebrow}
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink-50 sm:text-4xl">
        {title}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-300">{standfirst}</p>
      {updated && (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-600">
          Last updated{" "}
          {new Date(updated).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}

      <div className="mt-10 space-y-8 border-t border-white/5 pt-10">{children}</div>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink-100">
        {heading}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-400 [&_a]:text-accent [&_a]:underline-offset-4 hover:[&_a]:underline [&_strong]:font-semibold [&_strong]:text-ink-200">
        {children}
      </div>
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-ink-600" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
