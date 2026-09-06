import { relativeAge, ageTone, type AgeTone } from "@/app/lib/format";
import { Clock } from "lucide-react";

const TONE_CLASS: Record<AgeTone, string> = {
  fresh: "border-emerald-500/30 bg-emerald-500/15 text-emerald-200",
  recent: "border-white/10 bg-white/[0.06] text-ink-200",
  aging: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  stale: "border-rose-500/25 bg-rose-500/10 text-rose-200",
};

/**
 * The listing's age, shown on every card.
 *
 * Nothing on the grid used to convey how old a listing was, so a car first
 * posted sixteen weeks earlier looked exactly as current as one posted this
 * morning. Colour carries the same information as the text for quick scanning,
 * but the text alone is sufficient — colour is never the only signal.
 */
export function AgeChip({
  date,
  className = "",
  showIcon = true,
}: {
  date: Date | string | null | undefined;
  className?: string;
  showIcon?: boolean;
}) {
  const label = relativeAge(date);
  if (!label) return null;
  const tone = ageTone(date);

  return (
    <span
      title={`Listed ${label.toLowerCase()}`}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-md ${TONE_CLASS[tone]} ${className}`}
    >
      {showIcon && <Clock className="h-2.5 w-2.5" strokeWidth={2.5} />}
      {label}
    </span>
  );
}
