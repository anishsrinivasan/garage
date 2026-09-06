import Link from "next/link";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-50">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-ink-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  href?: string;
}) {
  const toneClass = {
    neutral: "text-ink-50",
    good: "text-emerald-300",
    warn: "text-amber-300",
    bad: "text-rose-300",
  }[tone];

  const body = (
    <div className="rounded-xl border border-white/[0.06] bg-ink-900/50 p-4 transition hover:border-white/[0.12]">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-500">
        {label}
      </p>
      <p className={`mt-1.5 font-display text-2xl font-bold leading-none ${toneClass}`}>
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </p>
      {hint && <p className="mt-1.5 text-[11px] text-ink-500">{hint}</p>}
    </div>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}

export function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-ink-900/40 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink-200">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
}) {
  const classes = {
    neutral: "border-white/10 bg-white/5 text-ink-300",
    good: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
    warn: "border-amber-500/25 bg-amber-500/10 text-amber-200",
    bad: "border-rose-500/25 bg-rose-500/10 text-rose-200",
    info: "border-sky-500/25 bg-sky-500/10 text-sky-200",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${classes}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 px-4 py-10 text-center text-sm text-ink-500">
      {children}
    </div>
  );
}
