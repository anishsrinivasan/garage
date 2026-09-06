"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { setReportStatus } from "@/lib/actions";

export function ReportActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await setReportStatus(id, "resolved");
          router.refresh();
        })
      }
      disabled={pending}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-ink-200 transition hover:bg-white/[0.07] disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      Resolve
    </button>
  );
}
