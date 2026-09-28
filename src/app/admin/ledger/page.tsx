import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getLedger } from "@/lib/sheets";
import { addLedgerAction } from "@/lib/actions";

export default async function LedgerPage() {
  const s = await getAdminSession();
  if (!s.isAdmin) redirect("/admin/login");
  const ledger = await getLedger();
  const bal = ledger.reduce((a, x) => a + x.amount_gold, 0);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Ledger — contributions, expenses, payouts</h1>
      <p className="text-sm text-[#8a7c64]">Balance: <b className="text-[#e0bd4a]">{bal}g</b>. Use negative or positive freely; expenses/payouts auto-negate. Split evenly when you pay rent or bard lessons.</p>

      <form action={addLedgerAction} className="card p-5 grid md:grid-cols-3 gap-3">
        <div><label className="lbl">Member</label><input name="member_char" defaultValue={s.charName} className="input" /></div>
        <div><label className="lbl">Type</label>
          <select name="type" className="input">
            <option value="contribution">contribution (+)</option>
            <option value="expense">expense (−)</option>
            <option value="payout">payout (−)</option>
            <option value="sale_income">sale_income (+)</option>
          </select>
        </div>
        <div><label className="lbl">Amount (g)</label><input name="amount_gold" type="number" min={0} defaultValue={0} className="input" /></div>
        <div><label className="lbl">Category</label><input name="category" className="input" placeholder="materials / rent / thread / bard-lessons" /></div>
        <div className="md:col-span-2"><label className="lbl">Description</label><input name="description" className="input" placeholder="e.g. 250g bars from Namhar" /></div>
        <div className="md:col-span-3"><button className="btn-gold" type="submit">Add entry</button></div>
      </form>

      <div className="card overflow-x-auto">
        <table className="ledger min-w-[700px]">
          <thead><tr><th>When</th><th>Type</th><th>Member</th><th>Amount</th><th>Category</th><th>Note</th></tr></thead>
          <tbody>
            {ledger.map((e) => (
              <tr key={e.id}>
                <td className="text-xs">{new Date(e.timestamp).toLocaleString()}</td>
                <td>{e.type}</td>
                <td>{e.member_char}</td>
                <td className={e.amount_gold >= 0 ? "text-[#7fd08a]" : "text-[#e08a8a]"}>{e.amount_gold}g</td>
                <td>{e.category}</td>
                <td className="text-[#8a7c64]">{e.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
