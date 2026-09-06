"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "./session";
import { triggerScrape, triggerMaintenance } from "./cron-client";

export type RunResult = { ok: true; jobId: string } | { ok: false; error: string };

export async function startScrape(sources?: string[]): Promise<RunResult> {
  await requireSession();
  const result = await triggerScrape({ sources });
  revalidatePath("/sources");
  return result.ok
    ? { ok: true, jobId: result.data.id }
    : { ok: false, error: result.error };
}

export async function startMaintenance(): Promise<RunResult> {
  await requireSession();
  const result = await triggerMaintenance();
  revalidatePath("/sources");
  return result.ok
    ? { ok: true, jobId: result.data.id }
    : { ok: false, error: result.error };
}
