"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { MessageSquarePlus, X, Send, Star, Loader2 } from "lucide-react";
import { submitFeedback } from "@/app/lib/feedback-action";

const CATEGORIES = ["Bug", "Feature Request", "General Feedback", "Other"] as const;
type Category = (typeof CATEGORIES)[number];

export function FeedbackModal() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("General Feedback");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = useCallback(() => {
    setCategory("General Feedback");
    setRating(0);
    setHoverRating(0);
    setMessage("");
    setSubmitted(false);
    setError(false);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(reset, 200);
  }, [reset]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  const handleSubmit = () => {
    if (!message.trim() || pending) return;
    setError(false);
    startTransition(async () => {
      try {
        await submitFeedback({ category, rating, message });
        setSubmitted(true);
        setTimeout(close, 1800);
      } catch {
        setError(true);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-accent-gradient shadow-glow transition hover:scale-105 hover:shadow-[0_12px_32px_-8px_rgba(251,146,60,0.5)] active:scale-95"
      >
        <MessageSquarePlus className="h-5 w-5 text-ink-950" strokeWidth={2.5} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Send feedback"
        >
          <div
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            onClick={close}
          />

          <div className="surface relative w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
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
                  <Send className="h-5 w-5" />
                </div>
                <p className="font-display text-lg font-semibold">Thanks for your feedback</p>
                <p className="text-sm text-ink-400">We appreciate you helping us improve Torque.</p>
              </div>
            ) : (
              <>
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Send Feedback
                </h2>
                <p className="mt-1 text-sm text-ink-400">
                  Help us make Torque better for car people.
                </p>

                <div className="mt-5 space-y-4">
                  <div>
                    <span className="field-label">Category</span>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCategory(c)}
                          className={`chip cursor-pointer transition ${
                            category === c
                              ? "border-accent/40 bg-accent/10 text-accent"
                              : "hover:border-white/12 hover:text-ink-200"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="field-label">Rating</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRating(n)}
                          onMouseEnter={() => setHoverRating(n)}
                          onMouseLeave={() => setHoverRating(0)}
                          aria-label={`${n} star${n > 1 ? "s" : ""}`}
                          className="p-0.5 transition"
                        >
                          <Star
                            className={`h-5 w-5 transition ${
                              n <= (hoverRating || rating)
                                ? "fill-accent text-accent"
                                : "text-ink-600"
                            }`}
                            strokeWidth={2}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="feedback-message" className="field-label">
                      Message
                    </label>
                    <textarea
                      id="feedback-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="What's on your mind?"
                      rows={4}
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
                      disabled={!message.trim() || pending}
                      className="btn-accent disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                    >
                      {pending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
                      ) : (
                        <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
                      )}
                      {pending ? "Submitting…" : "Submit"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
