import Link from "next/link";
import { UPCOMING_SECTIONS, getCatalogue, isSheetsConfigured } from "@/lib/sheets";

export const revalidate = 60;

export default async function Home() {
  const { categories, items } = await getCatalogue();
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  const active = items.filter((i) => i.active);
  const sections = sorted
    .map((c) => {
      const list = active.filter((i) => i.category_slug === c.slug);
      if (!list.length && !UPCOMING_SECTIONS.some((u) => u.slug === c.slug)) return null;
      const prices = list.map((i) => i.sale_price);
      return {
        ...c,
        comingSoon: list.length === 0,
        count: list.length,
        min: prices.length ? Math.min(...prices) : 0,
        max: prices.length ? Math.max(...prices) : 0,
      };
    })
    .filter((s) => s !== null);

  return (
    <div className="space-y-8">
      <section className="card p-6 md:p-8">
        <h1 className="font-display text-3xl md:text-4xl">Merchantlight Company</h1>
        <p className="mt-2 text-[#cbbfa5] max-w-2xl">
          Outfitters of Eastmarch. Bags, clothes, arms, jewelry and trade goods —
          crafted by friends, sold fair. White shirts welcome: come live, work, and trade with us.
        </p>
        {!isSheetsConfigured() && (
          <p className="mt-4 text-xs text-[#8a7c64]">
            Running on built-in seed data. Connect a Google Sheet (SHEET_ID) to edit stock without redeploying.
          </p>
        )}
      </section>

      <section id="sections" className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 scroll-mt-24">
        {sections.map((s) => (
          <Link key={s.slug} href={`/catalog/${s.slug}`} className="card p-5 hover:border-[#d97a1f] transition block">
            <div className="font-display text-xl">{s.icon} {s.name}</div>
            {s.comingSoon ? (
              <p className="mt-2 text-[#e0bd4a] font-display text-sm tracking-widest">✨ SOON TO COME ✨</p>
            ) : (
              <>
                <p className="text-sm text-[#b8a888] mt-1">
                  {s.count} goods
                </p>
                <p className="mt-2 text-[#e0bd4a]">
                  {s.min === s.max ? `${s.min}g` : `${s.min}–${s.max}g`}
                  <span className="text-sm text-[#c9a227] ml-2">Browse →</span>
                </p>
              </>
            )}
          </Link>
        ))}
      </section>
    </div>
  );
}
