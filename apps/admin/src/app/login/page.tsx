"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Gauge, Loader2 } from "lucide-react";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const { error: signInError } = await signIn.email({ email, password });

    if (signInError) {
      // Deliberately generic: distinguishing "no such user" from "wrong
      // password" tells an attacker which emails exist.
      setError("Those credentials didn't work.");
      setPending(false);
      return;
    }

    const next = searchParams.get("next");
    router.replace(next && next.startsWith("/") ? next : "/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-gradient">
            <Gauge className="h-4 w-4 text-ink-950" strokeWidth={2.5} />
          </span>
          <div>
            <p className="font-display text-lg font-bold leading-none">Torque</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500">
              Admin
            </p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-white/[0.06] bg-ink-900/60 p-6"
        >
          <div>
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-gradient px-4 py-2.5 text-sm font-bold text-ink-950 transition hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-ink-600">
          Accounts are created with{" "}
          <code className="font-mono">bun run create-user</code>. There is no
          public sign-up.
        </p>
      </div>
    </div>
  );
}
