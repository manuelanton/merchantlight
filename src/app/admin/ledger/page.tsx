import { addLedgerAction, deleteLedgerAction, updateLedgerAction } from "@/lib/admin-actions";
import { getBooks } from "@/lib/books";
import { g } from "@/lib/format";
import MemberSelect from "@/components/MemberSelect";

export const dynamic = "force-dynamic";

// sale_income rows are system-posted (every sale) — not offered as a manual choice.
const TYPES = ["contribution", "expense", "payout"] as const;

export default async function LedgerPage() {
  const b = await getBooks();
  const bal = b.ledgerRows.reduce((a, e) => a + e.amountGold, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl">Ledger — contributions, expenses, rent, payouts</h1>
        <a href="/api/admin/ledger" download className="btn-ghost !py-1 text-xs ml-auto whitespace-nowrap">Download JSON</a>
      </div>
      <p className="text-sm text-[#8a7c64]">
        Balance: <b className="text-[#e0bd4a]">{g(bal)}g</b> · Rent paid so far:{" "}
        <b className="text-[#e0bd4a]">{g(b.rentPaid)}g</b> (type <i>expense</i> + category <i>rent</i> splits evenly across members automatically).
      </p>

      <form action={addLedgerAction} className="card p-5 space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <MemberSelect members={b.members} name="member" label="Member" required />
          <div><label className="lbl">Type</label>
            <select name="type" className="input">
              <option value="contribution">contribution (+)</option>
              <option value="expense">expense (−)</option>
              <option value="payout">payout (−)</option>
            </select>
          </div>
          <div><label className="lbl">Amount (g)</label><input name="amount_gold" type="number" min={0} defaultValue={0} className="input" /></div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <div><label className="lbl">Category</label><input name="category" className="input" placeholder="rent / materials / thread" /></div>
          <div className="md:col-span-2"><label className="lbl">Description</label><input name="description" className="input" placeholder="e.g. Gallow's Rock rent, Morndas" /></div>
        </div>
        <div className="flex justify-end">
          <button className="btn-gold !py-2 !px-5 text-sm" type="submit">Add entry</button>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="ledger min-w-[820px]">
          <thead><tr><th>When</th><th>Type</th><th>Member</th><th>Amount</th><th>Category</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {b.ledgerRows.map((e) => (
              <tr key={e.id}>
                <td className="text-xs">{new Date(e.timestamp).toLocaleString()}</td>
                <td>{e.type}</td>
                <td>{e.member}</td>
                <td className={e.amountGold >= 0 ? "text-[#7fd08a]" : "text-[#e08a8a]"}>{g(e.amountGold)}g</td>
                <td>{e.category}</td>
                <td className="text-[#8a7c64]">{e.description}</td>
                <td className="whitespace-nowrap">
                  <details className="inline-block">
                    <summary className="btn-ghost !py-1 !px-2 text-xs cursor-pointer list-none inline-block">Edit</summary>
                    <form action={updateLedgerAction} className="mt-2 p-3 card space-y-2 min-w-[240px]">
                      <input type="hidden" name="id" value={e.id} />
                      <div><MemberSelect members={b.members} name="member" defaultValue={e.member} label="Member" /></div>
                      <div><label className="lbl">Type</label>
                        <select name="type" defaultValue={e.type} className="input">
                          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          {!(TYPES as readonly string[]).includes(e.type) && (
                            <option value={e.type}>{e.type} (auto)</option>
                          )}
                        </select>
                      </div>
                      <div><label className="lbl">Amount (g)</label><input name="amount_gold" type="number" defaultValue={Math.abs(e.amountGold)} className="input" /></div>
                      <div><label className="lbl">Category</label><input name="category" defaultValue={e.category} className="input" /></div>
                      <div><label className="lbl">Description</label><input name="description" defaultValue={e.description} className="input" /></div>
                      <button className="btn-gold !py-1 w-full text-sm" type="submit">Save</button>
                    </form>
                  </details>{" "}
                  <form action={deleteLedgerAction} className="inline-block">
                    <input type="hidden" name="id" value={e.id} />
                    <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Delete entry">✕</button>
                  </form>
                </td>
              </tr>
            ))}
            {!b.ledgerRows.length && <tr><td colSpan={7} className="text-[#8a7c64]">Ledger is empty — log the seed capital first.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
