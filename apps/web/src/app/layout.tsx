import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PreOwned Cars — Dashboard",
  description: "Browse and search preowned car listings",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <a href="/" className="text-lg font-semibold tracking-tight">
              PreOwned Cars
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
