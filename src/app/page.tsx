import Link from "next/link";
import { getCategories, getItems, isSheetsConfigured } from "@/lib/sheets";

export const revalidate = 60;

function stockBadge(stock: number, low: number) {
  if (stock <= 0) return <span className="badge badge-out">Out / Made to order</span>;
  if (stock <= low) return <span className="badge badge-low">Low — {stock} left</span>;
  return <span className="badge badge-in">In stock — {stock}</span>;
}

export default async function Home() {
  const [cats, items] = await Promise.all([getCategories(), getItems()]);
  const sorted = [...cats].sort((a, b) => a.sort_order - b.sort_order);
  const active = items.filter((i) => i.active);

  return (
    <div className="space-y-8">
      <section className="card p-6 md:p-8">
        <h1 className="font-display text-3xl md:text-4xl">Merchantlight Trading Company</h1>
        <p className="mt-2 text-[#cbbfa5] max-w-2xl">
          Outfitters of Windhelm & Eastmarch. Bags, clothes, arms, alchemy and trade goods —
          crafted by friends, sold fair. White shirts welcome: come live, work, and trade with us.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/order" className="btn-gold">Request an item</Link>
          <Link href="/admin" className="btn-ghost">Quartermaster books</Link>
        </div>
        {!isSheetsConfigured() && (
          <p className="mt-4 text-xs text-[#8a7c64]">
            Running on built-in seed data. Connect a Google Sheet (SHEET_ID) to edit stock without redeploying.
          </p>
        )}
      </section>

      {sorted.map((c) => {
        const list = active.filter((i) => i.category_slug === c.slug).sort((a, b) => a.sale_price - b.sale_price);
        if (!list.length) return null;
        return (
          <section key={c.slug} id={c.slug} className="space-y-3">
            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-2xl">{c.icon} {c.name}</h2>
              <Link href={`/catalog/${c.slug}`} className="text-sm text-[#c9a227] hover:underline">Full price list →</Link>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {list.slice(0, 6).map((i) => (
                <div key={i.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display">{i.name}</h3>
                    {stockBadge(i.stock, i.low_threshold)}
                  </div>
                  {i.description && <p className="text-sm text-[#b8a888] mt-1">{i.description}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg text-[#e0bd4a]">{i.sale_price}g</span>
                    {i.created_by_char && <span className="text-xs text-[#8a7c64]">by {i.created_by_char}</span>}
                  </div>
                </div>
              ))}
            </div>
            {/* per-category price list */}
            <div className="card p-0 overflow-hidden">
              <table className="ledger">
                <thead><tr><th>Item</th><th>Price</th><th>Stock</th><th>Maker</th></tr></thead>
                <tbody>
                  {list.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td className="text-[#e0bd4a]">{i.sale_price}g</td>
                      <td>{i.stock}</td>
                      <td className="text-[#8a7c64]">{i.created_by_char || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
