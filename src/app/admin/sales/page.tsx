import { getCatalogue } from "@/lib/catalog";
import { confirmAllSalesAction, confirmSaleAction, deleteSaleAction } from "@/lib/admin-actions";
import { getBooks } from "@/lib/books";
import { g } from "@/lib/format";
import SaleForm from "@/components/SaleForm";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const [{ categories, items }, books] = await Promise.all([getCatalogue(), getBooks()]);
  const live = items.filter((i) => i.active);
  const knownLocations = ["Darkwater Crossing", "Windhelm", "Darkwater Crossing", "Whiterun", "Winterhold"];
  for (const s of books.salesRows) {
    if (s.location && !knownLocations.includes(s.location)) knownLocations.push(s.location);
  }
  const pending = books.salesRows.filter((s) => s.status !== "confirmed");
  const done = books.salesRows.filter((s) => s.status === "confirmed");

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Record a sale</h1>
      <p className="text-sm text-[#8a7c64]">Sales land pending — gold splits only once someone confirms the deposit.</p>
      <SaleForm
        items={live.map((i) => ({ id: i.id, name: i.name, price: i.sale_price, category: i.category_slug, parent: i.parent_id ?? null }))}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        locations={knownLocations}
      />

      {pending.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg">Awaiting deposit ({pending.length})</h2>
            <form action={confirmAllSalesAction} className="ml-auto">
              <button className="btn-gold !py-1 text-xs" type="submit" title="Confirm every pending sale at once">Confirm all ✓</button>
            </form>
          </div>
          <table className="ledger mt-2">
            <thead><tr><th>Item</th><th>Qty</th><th>Total</th><th>By</th><th></th></tr></thead>
            <tbody>
              {pending.map((x) => (
                <tr key={x.id}>
                  <td>{x.itemName}</td>
                  <td>{x.qty}</td>
                  <td className="text-[#e0bd4a]">{g(x.unitSalePrice * x.qty)}g</td>
                  <td>{x.soldByName}</td>
                  <td className="whitespace-nowrap">
                    <form action={confirmSaleAction} className="inline-block mr-1">
                      <input type="hidden" name="id" value={x.id} />
                      <button className="btn-gold !py-1 !px-2 text-xs" type="submit" title="Confirm gold deposited — posts profit shares">Confirm ✓</button>
                    </form>
                    <form action={deleteSaleAction} className="inline-block">
                      <input type="hidden" name="id" value={x.id} />
                      <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Void sale">Void</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="ledger min-w-[860px]">
          <thead><tr><th>When</th><th>Item</th><th>Qty</th><th>Price</th><th>Profit</th><th>Where</th><th>By</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {done.map((x) => (
              <tr key={x.id}>
                <td className="text-xs">{new Date(x.timestamp).toLocaleString()}</td>
                <td>{x.itemName}</td>
                <td>{x.qty}</td>
                <td>{g(x.unitSalePrice)}g</td>
                <td className="text-[#7fd08a]">+{g(x.totalProfit)}g</td>
                <td>{x.location}</td>
                <td>{x.soldByName}</td>
                <td className="text-xs text-[#7fd08a]">✓ deposited</td>
                <td>
                  <form action={deleteSaleAction}>
                    <input type="hidden" name="id" value={x.id} />
                    <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Void sale (posts reversing stock move)">Void</button>
                  </form>
                </td>
              </tr>
            ))}
            {!books.salesRows.length && <tr><td colSpan={9} className="text-[#8a7c64]">No sales yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
