import Link from "next/link";
import { getCatalogue } from "@/lib/sheets";

export const revalidate = 60;

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { categories, items } = await getCatalogue();
  const cat = categories.find((c) => c.slug === slug);
  if (!cat) return <div>Unknown category. <Link href="/" className="text-[#c9a227]">Back</Link></div>;
  const list = items.filter((i) => i.active && i.category_slug === slug).sort((a, b) => a.sale_price - b.sale_price);
  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-[#c9a227]">← Catalogue</Link>
      <h1 className="font-display text-3xl">{cat.icon} {cat.name} — price list</h1>
      <div className="card overflow-hidden">
        <table className="ledger">
          <thead><tr><th>Item</th><th>Description</th><th>Price</th><th>Stock</th></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td className="text-[#8a7c64]">{i.description}</td>
                <td className="text-[#e0bd4a]">{i.sale_price}g</td>
                <td>{i.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/order" className="btn-gold inline-block">Request from this list</Link>
    </div>
  );
}
