import Link from "next/link";
import { getCatalogue } from "@/lib/sheets";

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
          {list.length} goods · Based in Gallow&apos;s Rock, Eastmarch — deliveries arranged.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {list.map((i) => (
          <div key={i.id} className="card p-4">
            <h3 className="font-display">{i.name}</h3>
            {i.description && <p className="text-sm text-[#b8a888] mt-1">{i.description}</p>}
            <div className="mt-3">
              <span className="text-lg text-[#e0bd4a]">{i.sale_price}g</span>
            </div>
          </div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <table className="ledger">
          <thead><tr><th>Item</th><th>Description</th><th>Price</th></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td className="text-[#8a7c64]">{i.description}</td>
                <td className="text-[#e0bd4a]">{i.sale_price}g</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
