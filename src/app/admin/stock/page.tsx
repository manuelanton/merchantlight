import { getCatalogue } from "@/lib/catalog";
import { deleteMoveAction } from "@/lib/admin-actions";
import { getBooks } from "@/lib/books";
import StockForm from "@/components/StockForm";

export default async function StockPage() {
  const [{ categories, items }, books] = await Promise.all([getCatalogue(), getBooks()]);
  const live = items.filter((i) => i.active);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Add stock</h1>
      <p className="text-sm text-[#8a7c64]">Removing stock happens through sales — use a negative amount here only for corrections.</p>
      <StockForm
        items={live.map((i) => ({ id: i.id, name: i.name, price: i.sale_price, category: i.category_slug }))}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      />

      <div className="card p-4">
        <h2 className="font-display text-lg">Current counts (moves − sales)</h2>
        <table className="ledger mt-2"><thead><tr><th>Item</th><th>On hand</th></tr></thead>
          <tbody>
            {[...books.stockByItem.values()].map((s) => (
              <tr key={s.name}><td>{s.name}</td><td>{s.qty}</td></tr>
            ))}
            {!books.stockByItem.size && <tr><td colSpan={2} className="text-[#8a7c64]">Nothing tracked yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <table className="ledger min-w-[760px]">
          <thead><tr><th>When</th><th>Item</th><th>Δ</th><th>Reason</th><th>By</th><th></th></tr></thead>
          <tbody>
            {books.moveRows.map((m) => {
              const locked = m.reason.startsWith("Sale (");
              return (
                <tr key={m.id}>
                  <td className="text-xs">{new Date(m.timestamp).toLocaleString()}</td>
                  <td>{m.itemName}</td>
                  <td className={m.delta >= 0 ? "text-[#7fd08a]" : "text-[#e08a8a]"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td className="text-[#8a7c64]">{m.reason}</td>
                  <td>{m.actorName}</td>
                  <td>
                    {!locked ? (
                      <form action={deleteMoveAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Delete move">✕</button>
                      </form>
                    ) : (
                      <span className="text-xs text-[#8a7c64]" title="Remove via the sale instead">🔒</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
