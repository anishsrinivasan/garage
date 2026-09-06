"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await signOut();
        router.replace("/login");
        router.refresh();
      }}
      className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-400 transition hover:bg-white/5 hover:text-ink-100"
    >
      <LogOut className="h-4 w-4" strokeWidth={1.8} />
      Sign out
    </button>
  );
}
