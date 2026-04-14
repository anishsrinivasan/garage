import { AtSign, Globe, Tag } from "lucide-react";

const PALETTE: Record<
  string,
  { label: string; fg: string; bg: string; ring: string }
> = {
  instagram: {
    label: "Instagram",
    fg: "text-pink-300",
    bg: "bg-pink-500/10",
    ring: "ring-pink-500/20",
  },
  cars24: {
    label: "Cars24",
    fg: "text-amber-300",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/20",
  },
  cardekho: {
    label: "CarDekho",
    fg: "text-sky-300",
    bg: "bg-sky-500/10",
    ring: "ring-sky-500/20",
  },
  olx: {
    label: "OLX",
    fg: "text-emerald-300",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/20",
  },
};

export function SourceBadge({
  platform,
  size = "sm",
}: {
  platform: string;
  size?: "sm" | "md";
}) {
  const key = platform.toLowerCase();
  const meta = PALETTE[key] ?? {
    label: platform,
    fg: "text-ink-200",
    bg: "bg-white/5",
    ring: "ring-white/10",
  };
  const Icon = key === "instagram" ? AtSign : key in PALETTE ? Globe : Tag;
  const pad = size === "md" ? "px-2.5 py-1 text-[11px]" : "px-1.5 py-0.5 text-[10px]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-semibold uppercase tracking-wider ring-1 ring-inset backdrop-blur-md ${pad} ${meta.fg} ${meta.bg} ${meta.ring}`}
    >
      <Icon className="h-3 w-3" strokeWidth={2.2} />
      {meta.label}
    </span>
  );
}
