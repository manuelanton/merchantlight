import { confirmAllSalesAction, confirmSaleAction, deleteSaleAction } from "@/lib/admin-actions";
import { g } from "@/lib/format";

export interface SaleRow {
  id: string;
  timestamp: string;
  itemName: string;
  qty: number;
  unitSalePrice: number;
  totalProfit: number;
  discount: number;
  deductedStock: boolean | null;
  location: string;
  soldByName: string;
}

/** Pending + confirmed sale tables, shared by v1 and v2 sales pages.
 *  Totals and profit honor per-line discounts (0 on older rows). */
export default function SalesTables({ pending, done }: { pending: SaleRow[]; done: SaleRow[] }) {
  const net = (x: SaleRow) => Math.max(0, x.unitSalePrice * x.qty - (x.discount || 0));
  const road = (x: SaleRow) =>
    x.deductedStock === false && (
      <span className="text-xs text-[#8a7c64]" title="Road sale — never touched chest stock"> 🛣</span>
    );
  const disc = (x: SaleRow) =>
    x.discount > 0 && (
      <span className="text-xs text-[#8a7c64]" title="Flat discount on this line"> −{g(x.discount)}g</span>
    );
  return (
    <>
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
                  <td>{x.itemName}{road(x)}{disc(x)}</td>
                  <td>{x.qty}</td>
                  <td className="text-[#e0bd4a]">{g(net(x))}g</td>
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
                <td>{x.itemName}{road(x)}{disc(x)}</td>
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
            {!pending.length && !done.length && <tr><td colSpan={9} className="text-[#8a7c64]">No sales yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
