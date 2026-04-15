"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { Flag, X, Send, Loader2 } from "lucide-react";
import { submitListingReport } from "@/app/lib/report-action";

const REPORT_TYPES = [
  "Image mismatch",
  "Content mismatch",
  "Other",
] as const;
type ReportType = (typeof REPORT_TYPES)[number];

export function ReportListingModal({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("Image mismatch");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const reset = useCallback(() => {
    setReportType("Image mismatch");
    setDescription("");
    setSubmitted(false);
    setError(false);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(reset, 200);
  }, [reset]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handler);
    };
  }, [open, close]);

  const handleSubmit = () => {
    if (pending) return;
    if (reportType === "Other" && !description.trim()) return;
    setError(false);
    startTransition(async () => {
      try {
        await submitListingReport({
          listingId,
          reportType,
          description: description || undefined,
        });
        setSubmitted(true);
        setTimeout(close, 1800);
      } catch {
        setError(true);
      }
    });
  };

  const submitDisabled =
    pending || (reportType === "Other" && !description.trim());

  const modal = open ? (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Report listing issue"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={close}
      />

      <div className="relative w-full max-w-md rounded-t-2xl border border-white/10 bg-ink-950 p-6 shadow-2xl sm:rounded-2xl">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition hover:bg-white/5 hover:text-ink-50"
        >
          <X className="h-4 w-4" />
        </button>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
              <Flag className="h-5 w-5" />
            </div>
            <p className="font-display text-lg font-semibold">
              Report submitted
            </p>
            <p className="text-sm text-ink-400">
              Thanks for helping us keep listings accurate.
            </p>
          </div>
        ) : (
          <>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Report Issue
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              Let us know what&apos;s wrong with this listing.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <span className="field-label">Issue type</span>
                <div className="flex flex-wrap gap-2">
                  {REPORT_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setReportType(t)}
                      className={`chip cursor-pointer transition ${
                        reportType === t
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "hover:border-white/12 hover:text-ink-200"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="report-description" className="field-label">
                  Description
                  {reportType === "Other" && (
                    <span className="text-rose-400"> *</span>
                  )}
                </label>
                <textarea
                  id="report-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    reportType === "Other"
                      ? "Describe the issue..."
                      : "Optional — add more details"
                  }
                  rows={3}
                  className="field resize-none"
                />
              </div>

              {error && (
                <p className="text-xs text-rose-400">
                  Something went wrong. Please try again.
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={close} className="btn-ghost">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitDisabled}
                  className="btn-accent disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                >
                  {pending ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      strokeWidth={2.5}
                    />
                  ) : (
                    <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
                  )}
                  {pending ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-sm text-ink-400 transition hover:border-rose-500/20 hover:bg-rose-500/5 hover:text-rose-300"
      >
        <Flag className="h-4 w-4" strokeWidth={1.8} />
        Report an issue with this listing
      </button>

      {mounted && modal && createPortal(modal, document.body)}
    </>
  );
}
