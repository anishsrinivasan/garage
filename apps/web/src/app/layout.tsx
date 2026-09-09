import { Providers } from "./providers";
import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { Gauge } from "lucide-react";
import { SavedNavLink } from "@/app/components/saved-nav-link";
import { CityPicker } from "@/app/components/city-picker";
import { MobileMenu } from "@/app/components/mobile-menu";
import { FeedbackModal } from "@/app/components/feedback-modal";
import "./globals.css";
import { SITE_URL } from "@/app/lib/site";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const TITLE = "Classifieds — Preowned Cars, Curated";
const DESCRIPTION =
  "A curated, real-time dashboard of preowned car listings across India — from Cars24, CarDekho, OLX, and trusted Instagram dealers. Deduplicated, normalized, searchable.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · Classifieds",
  },
  description: DESCRIPTION,
  applicationName: "Classifieds",
  authors: [{ name: "Classifieds" }],
  keywords: [
    "preowned cars",
    "used cars india",
    "car listings",
    "cars24",
    "cardekho",
    "olx cars",
    "car enthusiasts",
    "chennai used cars",
    "car dealers",
  ],
  category: "automotive",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "Classifieds",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "/",
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090B" },
    { media: "(prefers-color-scheme: light)", color: "#09090B" },
  ],
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // maximumScale/userScalable were pinned, which blocks pinch-zoom entirely —
  // a WCAG 1.4.4 failure and painful on a site whose whole point is looking
  // closely at photos.
};

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-600">
        {title}
      </p>
      <ul className="mt-3 space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-xs text-ink-400 transition hover:text-ink-100"
      >
        {children}
      </Link>
    </li>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="font-sans">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[700px] bg-hero-glow" />
          <div className="absolute inset-0 grid-bg opacity-40 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent_70%)]" />
        </div>

        <header className="relative sticky top-0 z-40 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-accent-gradient shadow-glow transition group-hover:scale-105">
                <Gauge className="h-4 w-4 text-ink-950" strokeWidth={2.5} />
                <span className="absolute -inset-1 -z-10 rounded-xl bg-accent-gradient opacity-40 blur-md" />
              </span>
              <span className="font-display text-[17px] font-bold tracking-tight">
                Classifieds
                <span className="ml-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-wider text-ink-300">
                  IN
                </span>
              </span>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-300 transition hover:bg-white/5 hover:text-ink-50"
              >
                Cars
              </Link>
              <Link
                href="/rent"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-300 transition hover:bg-white/5 hover:text-ink-50"
              >
                Rentals
              </Link>
              <Link
                href="/garages"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-400 transition hover:bg-white/5 hover:text-ink-50"
              >
                Garages
              </Link>
              <SavedNavLink />
            </nav>

            <div className="flex items-center gap-2">
              {/* Visible on every page: the first thing someone wants to know
                  is whether their city is covered. */}
              <CityPicker />
              <MobileMenu />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <Providers>{children}</Providers>
        </main>
        <FeedbackModal />

        <footer className="mt-24 border-t border-white/5">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
              <div className="max-w-sm">
                <div className="flex items-center gap-2 text-xs text-ink-400">
                  <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                  <span>Listings verified against their source on every scrape</span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-600">
                  Preowned cars and rental homes across Chennai, collected from the
                  dealers and brokers who posted them. An index, not a marketplace.
                </p>
              </div>

              <div className="flex flex-col gap-8 sm:flex-row sm:gap-16">
                <FooterColumn title="Browse">
                  <FooterLink href="/">Cars</FooterLink>
                  <FooterLink href="/rent">Rentals</FooterLink>
                  <FooterLink href="/garages">Garages</FooterLink>
                  <FooterLink href="/saved">Saved</FooterLink>
                </FooterColumn>

                {/* The index is meant to be queried, not scraped — so the way in
                    is a footer link rather than something only agents find. */}
                <FooterColumn title="For agents">
                  <FooterLink href="/mcp">MCP endpoint</FooterLink>
                  <FooterLink href="/llms.txt">llms.txt</FooterLink>
                  <FooterLink href="/api/listings">JSON API</FooterLink>
                </FooterColumn>

                <FooterColumn title="Legal">
                  <FooterLink href="/terms">Terms of use</FooterLink>
                  <FooterLink href="/privacy">Privacy</FooterLink>
                </FooterColumn>
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-2 border-t border-white/5 pt-6 text-xs text-ink-600 sm:flex-row sm:items-center sm:justify-between">
              <p>© {new Date().getFullYear()} Classifieds · Built for car people</p>
              <p>
                Listing photos and text belong to whoever posted them, and each
                listing links back to its source.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}


