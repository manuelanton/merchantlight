import Link from "next/link";
import { requireQuartermasterPage } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

/** v2 pilot hub: the new surfaces, side by side with v1. Same books underneath. */
export default async function V2HubPage() {
  await requireQuartermasterPage();
  const cards = [
    { href: "/admin/v2/sales", title: "Record a sale (v2)", desc: "Same form plus a per-line discount column. Revenue is price minus discount." },
    { href: "/admin/v2/ledger", title: "Ledger + purchases (v2)", desc: "Expenses can log what goods came in, in the same submit — one step instead of two." },
    { href: "/admin/v2/report", title: "Sales report (v2)", desc: "Who sold what, revenue by section, top items — today, 7, 30 days, all time." },
  ];
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">✨ v2 pilot</h1>
      <p className="text-sm text-[#8a7c64] max-w-2xl">
        Trial surfaces on top of the same books. v1 pages keep working untouched — use either,
        everything lands in the same ledger. Roles now apply everywhere: workers record,
        managers confirm, pay, and edit.
      </p>
      <div className="grid md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card p-5 hover:border-[#d97a1f] transition block">
            <div className="font-display text-xl">{c.title}</div>
            <p className="text-sm text-[#b8a888] mt-1">{c.desc}</p>
            <p className="mt-2 text-[#e0bd4a] text-sm">Open →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
