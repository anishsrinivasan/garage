"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, Heart } from "lucide-react";
import { useBookmarks } from "@/app/lib/use-bookmarks";
import { usePathname } from "next/navigation";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { count } = useBookmarks();
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-ink-200 transition hover:border-white/20 hover:bg-white/[0.06]"
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {open && (
        <nav className="absolute inset-x-0 top-full z-50 border-b border-white/5 bg-ink-950/95 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl space-y-1 px-4 py-3">
            <MobileLink href="/" active={pathname === "/"} onClick={() => setOpen(false)}>
              Browse
            </MobileLink>
            <MobileLink href="/garages" active={pathname.startsWith("/garages")} onClick={() => setOpen(false)}>
              Garages
            </MobileLink>
            <MobileLink href="/saved" active={pathname === "/saved"} onClick={() => setOpen(false)}>
              <span className="flex items-center gap-2">
                <Heart className="h-3.5 w-3.5" strokeWidth={2} />
                Saved
                {count > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500/20 px-1 font-mono text-[10px] font-bold text-rose-300 ring-1 ring-inset ring-rose-500/30">
                    {count}
                  </span>
                )}
              </span>
            </MobileLink>
          </div>
        </nav>
      )}
    </div>
  );
}

function MobileLink({
  href,
  active,
  onClick,
  children,
}: {
  href: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-white/5 text-ink-50"
          : "text-ink-400 hover:bg-white/5 hover:text-ink-50"
      }`}
    >
      {children}
    </Link>
  );
}
