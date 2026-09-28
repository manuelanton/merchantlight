import Link from "next/link";
import { getCatalogue } from "@/lib/catalog";

export const revalidate = 60;

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { categories, items } = await getCatalogue();
  const cat = categories.find((c) => c.slug === slug);
  if (!cat) return <div>Unknown section. <Link href="/" className="text-[#c9a227]">Back</Link></div>;
  const list = items.filter((i) => i.active && i.category_slug === slug).sort((a, b) => a.sale_price - b.sale_price);
  if (!list.length) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-sm text-[#c9a227]">← All sections</Link>
        <h1 className="font-display text-3xl flex items-center gap-3">
          <span aria-hidden className="text-[0.85em] leading-none">{cat.icon}</span>
          <span>{cat.name}</span>
        </h1>
        <div className="card p-8 text-center space-y-2">
          <p className="font-display text-xl text-[#e0bd4a] tracking-widest">✨ SOON TO COME ✨</p>
          <p className="text-[#b8a888] text-sm max-w-md mx-auto">
            Our enchanter is still setting up the arcane table. Send word in Windhelm
            or visit us in Gallow&apos;s Rock and we&apos;ll tell you when the first
            enchantments are ready.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-[#c9a227]">← All sections</Link>
      <div>
        <h1 className="font-display text-3xl flex items-center gap-3">
          <span aria-hidden className="text-[0.85em] leading-none">{cat.icon}</span>
          <span>{cat.name}</span>
        </h1>
        <p className="text-sm text-[#8a7c64] mt-1">
          {list.length} goods · Based in Gallow&apos;s Rock — deliveries within Eastmarch.
        </p>
      </div>
      <div className="card overflow-hidden px-2 py-1">
        <ul className="md:columns-2 md:gap-8">
          {list.map((i) => (
            <li key={i.id} className="px-3 py-3 border-b border-[#1c2b31] break-inside-avoid hover:bg-[#d97a1f]/5 transition">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-lg">{i.name}</span>
                <span aria-hidden className="flex-1 border-b border-dotted border-[#5a4a33] -translate-y-1" />
                <span className="text-lg text-[#e0bd4a] whitespace-nowrap">{i.sale_price}g</span>
              </div>
              {i.description && <p className="text-sm text-[#8a7c64] mt-0.5">{i.description}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
