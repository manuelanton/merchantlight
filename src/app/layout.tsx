import type { Metadata } from "next";
import Link from "next/link";
import Sigil from "@/components/Sigil";
import "./globals.css";

export const metadata: Metadata = {
  title: "Merchantlight Company — Windhelm / Eastmarch",
  description: "Catalogue, orders, and quartermaster books for the Merchantlight Company (Keizaal).",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Skyrim-y display font: Cinzel Decorative (Trajan-like, carved Roman/Nord feel).
            Alternative Nord-runic options if you want more: Uncial Antiqua, Metamorphous, IM Fell English SC. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@500;700&family=Spectral:ital,wght@0,400;0,600;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="border-b border-[#14424f] bg-[#0e1518]/95 sticky top-0 z-20 shadow-[0_2px_0_0_#d97a1f33]">
          <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              {/* Save your three-hound sigil as public/logo.png — header + favicon use it automatically. */}
              <Sigil />
              <span className="font-display text-xl md:text-2xl text-[#e8dcc4]">
                Merchantlight <span className="text-[#c9a227]">Company</span>
              </span>
            </Link>
            <nav className="ml-auto flex gap-3 text-sm">
              <Link className="hover:text-[#c9a227]" href="/">Catalogue</Link>
              <Link className="hover:text-[#c9a227]" href="/order">Order</Link>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
        <footer className="max-w-6xl mx-auto px-4 pb-10 text-sm text-[#8a7c64]">
          <p>Merchantlight Trading Company — friends of Windhelm & Eastmarch. Prices in gold. Pickup: Windhelm, Darkwater Crossing, Whiterun.</p>
        </footer>
      </body>
    </html>
  );
}
