"use client";

import { useState, useTransition } from "react";
import { setSourceActive } from "@/lib/actions";

export function SourceToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [active, setActive] = useState(isActive);
  const [pending, startTransition] = useTransition();

  return (
    <button
      role="switch"
      aria-checked={active}
      aria-label={active ? "Pause this source" : "Enable this source"}
      disabled={pending}
      onClick={() => {
        const next = !active;
        setActive(next);
        startTransition(async () => {
          const result = await setSourceActive(id, next);
          // Roll the optimistic flip back if the write didn't land.
          if (!result.ok) setActive(!next);
        });
      }}
      className={`relative h-5 w-9 rounded-full transition disabled:opacity-50 ${
        active ? "bg-accent" : "bg-white/10"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          active ? "left-[1.125rem]" : "left-0.5"
        }`}
      />
    </button>
  );
}
