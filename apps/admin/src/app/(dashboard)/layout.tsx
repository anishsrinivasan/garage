import Link from "next/link";
import {
  Gauge,
  LayoutDashboard,
  ListFilter,
  Store,
  Radio,
  AlertTriangle,
  Inbox,
  MapPin,
} from "lucide-react";
import { requireSession } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";
import { getReviewCount, getOpenReportCount } from "@/lib/admin-queries";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/listings", label: "Listings", icon: ListFilter },
  { href: "/review", label: "Review queue", icon: AlertTriangle, badge: "review" },
  { href: "/garages", label: "Garages", icon: Store },
  { href: "/geography", label: "Geography", icon: MapPin },
  { href: "/sources", label: "Sources & runs", icon: Radio },
  { href: "/inbox", label: "Inbox", icon: Inbox, badge: "reports" },
] as const;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const [reviewCount, reportCount] = await Promise.all([
    getReviewCount(),
    getOpenReportCount(),
  ]);
  const badges: Record<string, number> = {
    review: reviewCount,
    reports: reportCount,
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-white/[0.06] bg-ink-900/40 p-4 lg:block">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-gradient">
            <Gauge className="h-4 w-4 text-ink-950" strokeWidth={2.5} />
          </span>
          <div>
            <p className="font-display text-sm font-bold leading-none">Classifieds</p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
              Admin
            </p>
          </div>
        </div>

        <nav className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon, ...rest }) => {
            const badge = "badge" in rest ? badges[rest.badge] : 0;
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-white/5 hover:text-ink-50"
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                  {label}
                </span>
                {badge ? (
                  <span className="rounded-full bg-accent/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent">
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-8 border-t border-white/5 pt-4">
          <p className="truncate px-3 text-[11px] text-ink-500">
            {session.user.email}
          </p>
          <SignOutButton />
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
}
