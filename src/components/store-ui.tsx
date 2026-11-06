import Link from "next/link";
import type { ReactNode } from "react";

// The few building blocks every backoffice page shares.

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 className="font-display text-2xl">{title}</h1>
        {subtitle && <p className="muted text-sm mt-1">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="panel px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div className={`text-2xl mt-1 tabular-nums ${tone === "bad" ? "text-[#e08a8a]" : "text-[#e0bd4a]"}`}>{value}</div>
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h2 className="eyebrow">{title}</h2>
        {aside && <div className="muted text-xs">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function Notice({ error }: { error?: string }) {
  if (!error) return null;
  return <p role="alert" className="panel border-[#7a2430] text-[#e08a8a] text-sm px-4 py-3 mb-4">{error}</p>;
}

export const PAGE_SIZE = 50;

/** "1–50 of 120" with arrows; `href` builds the link to a page, counted from 0. */
export function Pager({ page, total, href }: { page: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages === 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm muted py-3">
      <span className="tabular-nums">{page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}</span>
      <span className="flex items-center gap-2">
        {page > 0 && <Link className="btn-ghost !py-1 !px-3" href={href(page - 1)} aria-label="Previous page">←</Link>}
        <span className="tabular-nums">Page {page + 1} / {pages}</span>
        {page < pages - 1 && <Link className="btn-ghost !py-1 !px-3" href={href(page + 1)} aria-label="Next page">→</Link>}
      </span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted text-sm px-4 py-6">{children}</p>;
}
