import { auth } from "@/auth";
import { getCatalogue } from "@/lib/catalog";
import { deleteSaleAction } from "@/lib/admin-actions";
import { getBooks } from "@/lib/books";
import { g } from "@/lib/format";
import SaleForm from "@/components/SaleForm";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const [{ categories, items }, books, session] = await Promise.all([getCatalogue(), getBooks(), auth()]);
  const live = items.filter((i) => i.active);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Record a sale</h1>
      <SaleForm
        items={live.map((i) => ({ id: i.id, name: i.name, price: i.sale_price, category: i.category_slug }))}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      />

      <div className="card overflow-x-auto">
        <table className="ledger min-w-[860px]">
          <thead><tr><th>When</th><th>Item</th><th>Qty</th><th>Price</th><th>Profit</th><th>Where</th><th>By</th><th></th></tr></thead>
          <tbody>
            {books.salesRows.map((x) => (
              <tr key={x.id}>
                <td className="text-xs">{new Date(x.timestamp).toLocaleString()}</td>
                <td>{x.itemName}</td>
                <td>{x.qty}</td>
                <td>{g(x.unitSalePrice)}g</td>
                <td className="text-[#7fd08a]">+{g(x.totalProfit)}g</td>
                <td>{x.location}</td>
                <td>{x.soldByName}</td>
                <td>
                  <form action={deleteSaleAction}>
                    <input type="hidden" name="id" value={x.id} />
                    <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Void sale (posts reversing stock move)">Void</button>
                  </form>
                </td>
              </tr>
            ))}
            {!books.salesRows.length && <tr><td colSpan={8} className="text-[#8a7c64]">No sales yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
