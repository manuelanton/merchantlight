import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Merchantlight Company — Gallow's Rock, Eastmarch",
  description: "Catalogue of the Merchantlight Company (Keizaal) — outfitters based in Gallow's Rock, Eastmarch. Deliveries arranged.",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
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
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-[#14424f] bg-[#0e1518]/95 sticky top-0 z-20 shadow-[0_2px_0_0_#d97a1f33]">
          <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <span className="font-display text-xl md:text-2xl text-[#e8dcc4]">
                🕯️ Merchantlight <span className="text-[#c9a227]">Company</span>
              </span>
            </Link>
            <nav className="ml-auto flex gap-3 text-sm">
              <Link className="hover:text-[#c9a227]" href="/#sections">Catalogue</Link>
              <Link className="hover:text-[#c9a227]" href="/visit">Visit us</Link>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl w-full mx-auto px-4 py-6 flex-1">{children}</main>
        <footer className="mt-8 border-t-2 border-[#d97a1f]/60 bg-[#0e1518]/95">
          <div className="max-w-6xl mx-auto px-4 py-6 text-center space-y-1">
            <p className="font-display text-[#e8dcc4]">Merchantlight Company</p>
            <p className="text-sm text-[#8a7c64]">
              Based in Gallow&apos;s Rock, Eastmarch · Prices in gold · Deliveries arranged within Eastmarch
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
