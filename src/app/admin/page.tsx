import Link from "next/link";
import { adjustBalanceAction, adjustCashAction, deleteCashMoveAction, requestRestockAction, setCoffersFloorAction, setShopOpenAction, sweepCashAction } from "@/lib/admin-actions";
import { getBooks } from "@/lib/books";
import { g } from "@/lib/format";
import { isShopOpen } from "@/lib/shop";
import { getCash } from "@/lib/cash";
import { getCatalogue } from "@/lib/catalog";
import { getStorage } from "@/lib/storage";
import { effectiveThreshold } from "@/lib/defaults";
import { isFeatureOn } from "@/lib/features";
import { SHOP } from "@/shop/config";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<string, string> = { news: "📯", request: "🙏", todo: "☑️", stock: "📦" };

export default async function AdminHome() {
  const b = await getBooks();
  const open = await isShopOpen();
  const st = await getStorage();
  const cash = await getCash();
  const lockbox = cash.pots.find((p) => p.name === "Lockbox")?.balance || 0;
  const { items } = await getCatalogue();
  const trackStock = await isFeatureOn("stock");
  const thresholdFor = (id: string) => effectiveThreshold(items.find((i) => i.id === id)?.low_threshold);
  const lowStock = [...b.stockByParent.entries()]
    .filter(([, s]) => s.qty > 0)
    .map(([id, s]) => ({ ...s, threshold: thresholdFor(id) }))
    .filter((s) => s.qty <= s.threshold);
  const ledgerBal = b.ledgerRows.reduce((a, e) => a + e.amountGold, 0);
  const openNotes = b.noteRows.filter((n) => !n.resolved);
  const hotMap = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const s of b.salesRows) {
    const cur = hotMap.get(s.itemId) || { name: s.itemName, qty: 0, revenue: 0 };
    cur.qty += s.qty;
    cur.revenue += s.unitSalePrice * s.qty;
    if (s.itemName) cur.name = s.itemName;
    hotMap.set(s.itemId, cur);
  }
  const hottest = [...hotMap.values()].sort((a, c) => c.qty - a.qty).slice(0, 5);
  const pendingSales = b.salesRows.filter((s) => s.status !== "confirmed");
  const pendingGold = pendingSales.reduce((a, s) => a + s.unitSalePrice * s.qty, 0);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">{SHOP.roleName} dashboard</h1>
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <span className={open ? "badge badge-in" : "badge badge-out"}>
          {open ? "● Open — salesperson on duty" : "○ Closed"}
        </span>
        <span className="text-sm text-[#8a7c64]">Shows in the site hero for customers.</span>
        <form action={setShopOpenAction} className="ml-auto">
          <input type="hidden" name="open" value={open ? "0" : "1"} />
          <button className={open ? "btn-ghost !py-1 text-sm" : "btn-gold !py-1 text-sm"} type="submit">
            {open ? "Close shop" : "Open shop"}
          </button>
        </form>
      </div>
      <div className="grid md:grid-cols-5 gap-4">
        <div className="card p-4"><div className="lbl">Revenue (sales)</div><div className="text-2xl text-[#e0bd4a]">{g(b.revenue)}g</div></div>
        <div className="card p-4"><div className="lbl">Profit (sales)</div><div className="text-2xl text-[#e0bd4a]">{g(b.profit)}g</div></div>
        <div className="card p-4"><div className="lbl">Storage earned</div><div className="text-2xl text-[#e0bd4a]">{g(st.earned)}g</div></div>
        <div className="card p-4"><div className="lbl">Rent paid</div><div className="text-2xl text-[#e0bd4a]">{g(b.rentPaid)}g</div></div>
        <div className="card p-4"><div className="lbl">Ledger balance</div><div className="text-2xl text-[#e0bd4a]">{g(ledgerBal)}g</div>
          <details className="mt-1">
            <summary className="text-xs text-[#c9a227] cursor-pointer hover:text-[#e8dcc4]">Adjust…</summary>
            <form action={adjustBalanceAction} className="flex gap-2 mt-2 items-center">
              <input name="target_gold" type="number" step="any" defaultValue={Math.round(ledgerBal * 100) / 100} className="input !py-1 text-sm" aria-label="Target balance" />
              <button className="btn-ghost !py-1 text-xs whitespace-nowrap" type="submit" title="Posts one unattributed adjustment for the difference">Set</button>
            </form>
          </details>
        </div>
      </div>
      <div className="card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-display text-lg">Cash:</span>
        {cash.pots.map((p) => (
          <span key={p.name} className="text-sm" title={p.name === "Lockbox" ? "Confirmed sales land here" : "Swept end-of-day funds"}>
            {p.name} <b className="text-[#e0bd4a]">{g(p.balance)}g</b>
          </span>
        ))}
        {cash.floor > 0 && (
          <span className={`text-sm ${cash.pots.reduce((a, p) => a + p.balance, 0) >= cash.floor ? "text-[#8a7c64]" : "text-[#e08a8a] font-bold"}`} title="Coffers floor — pooled gold should stay above this">
            floor {g(cash.floor)}g{cash.pots.reduce((a, p) => a + p.balance, 0) < cash.floor ? " — below!" : ""}
          </span>
        )}
        <span className="text-xs text-[#8a7c64]">Sales land in the lockbox; sweep moves the take to the safe. Starting gold via Adjust below.</span>
        <form action={setCoffersFloorAction} className="flex gap-2 items-center ml-auto">
          <input name="floor_gold" type="number" min={0} step="any" defaultValue={cash.floor > 0 ? cash.floor : ""} placeholder="Floor" className="input !w-24 !py-1 text-sm" title="Coffers floor — warn when pooled gold drops below this" />
          <button className="btn-ghost !py-1 text-xs whitespace-nowrap" type="submit" title="Set the coffers floor">Set floor</button>
        </form>
        <form action={sweepCashAction} className="flex gap-2 items-center ml-auto">
          <input name="amount_gold" type="number" min={0} step="any" defaultValue={lockbox > 0 ? lockbox : ""} placeholder="Amount" className="input !w-24 !py-1 text-sm" title="End-of-day: move gold from lockbox to safe" />
          <button className="btn-gold !py-1 text-xs whitespace-nowrap" type="submit" title="Move gold from the register lockbox to the safe">Sweep to safe →</button>
        </form>
      </div>
      <details>
        <summary className="text-xs text-[#c9a227] cursor-pointer hover:text-[#e8dcc4]">Adjust cash manually (starting float, found gold, corrections)…</summary>
        <form action={adjustCashAction} className="card p-4 mt-2 flex flex-wrap gap-2 items-center">
          <select name="pot" className="input !w-auto !py-1 text-sm" defaultValue="Lockbox">
            <option>Lockbox</option>
            <option>Safe</option>
          </select>
          <input name="amount_gold" type="number" step="any" placeholder="+/- amount" className="input !w-32 !py-1 text-sm" title="Positive adds, negative removes" />
          <input name="reason" className="input !py-1 text-sm flex-1" placeholder="Reason — e.g. opening float" />
          <button className="btn-ghost !py-1 text-xs whitespace-nowrap" type="submit">Log cash</button>
        </form>
      </details>
      <details>
        <summary className="text-xs text-[#c9a227] cursor-pointer hover:text-[#e8dcc4]">Cash history (sweeps go away as a pair)…</summary>
        <div className="card mt-2 overflow-x-auto">
          <table className="ledger min-w-[640px]">
            <thead><tr><th>When</th><th>Pot</th><th>Amount</th><th>Note</th><th>By</th><th></th></tr></thead>
            <tbody>
              {cash.moves.map((m) => (
                <tr key={m.id}>
                  <td className="text-xs">{new Date(m.timestamp).toLocaleString()}</td>
                  <td>{m.pot}</td>
                  <td className={m.delta >= 0 ? "text-[#7fd08a]" : "text-[#e08a8a]"}>{g(m.delta)}g</td>
                  <td className="text-[#8a7c64]">{m.reason}</td>
                  <td>{m.actorName}</td>
                  <td>
                    <form action={deleteCashMoveAction} className="inline-block">
                      <input type="hidden" name="id" value={m.id} />
                      <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Delete this cash move">✕</button>
                    </form>
                  </td>
                </tr>
              ))}
              {!cash.moves.length && <tr><td colSpan={6} className="text-[#8a7c64]">No cash moves yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </details>
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <span className="font-display text-lg">Storage: {st.filled}/{st.units.filter((u) => u.kind !== "internal").length} filled</span>
        {st.overdue.length > 0 ? (
          <span className="badge badge-out">{st.overdue.length} past due: {st.overdue.slice(0, 4).map((u) => u.label).join(", ")}{st.overdue.length > 4 ? "…" : ""}</span>
        ) : (
          <span className="badge badge-in">All paid up</span>
        )}
        <Link href="/admin/storage" className="text-sm text-[#c9a227] ml-auto">Manage storage →</Link>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4">
          <h2 className="font-display text-lg">Per-member balances</h2>
          <table className="ledger mt-2"><thead><tr><th>Member</th><th>Net</th></tr></thead>
            <tbody>{b.balances.map(([m, v]) => <tr key={m}><td>{m}</td><td>{g(v)}g</td></tr>)}</tbody>
          </table>
          {b.balances.length >= 2 && (
            <p className="text-xs text-[#8a7c64] mt-2">
              Rent bills split automatically, and only sale <i>profit</i> splits across members.
              Average: {g(ledgerBal / b.balances.length)}g each.
            </p>
          )}
          <Link href="/admin/ledger" className="text-sm text-[#c9a227]">Open ledger →</Link>
        </div>
        <div className="card p-4">
          <h2 className="font-display text-lg">Noticeboard {openNotes.length > 0 && <span className="text-sm text-[#e0bd4a]">({openNotes.length} open)</span>}</h2>
          <ul className="text-sm mt-2 space-y-1">
            {openNotes.slice(0, 5).map((n) => (
              <li key={n.id}>{KIND_ICON[n.kind] || "•"} <b>{n.title}</b> <span className="text-[#8a7c64]">— {n.authorName}</span></li>
            ))}
            {!openNotes.length && <li className="text-[#8a7c64]">All quiet. Post news, requests, todos.</li>}
          </ul>
          <Link href="/admin/notes" className="text-sm text-[#c9a227]">Open noticeboard →</Link>
        </div>
        <div className="card p-4">
          <h2 className="font-display text-lg">Awaiting deposit</h2>
          {pendingSales.length ? (
            <>
              <p className="text-2xl text-[#e0bd4a] mt-1">{g(pendingGold)}g</p>
              <p className="text-sm text-[#8a7c64]">{pendingSales.length} sale{pendingSales.length > 1 ? "s" : ""} still with their sellers.</p>
            </>
          ) : (
            <p className="text-sm text-[#8a7c64] mt-1">Chest matches the books. ✓</p>
          )}
          <Link href="/admin/sales" className="text-sm text-[#c9a227]">Review sales →</Link>
        </div>
        <div className="card p-4 md:col-span-3">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h2 className="font-display text-lg">Hottest items</h2>
              <ul className="text-sm mt-2 space-y-1">
                {hottest.map((h, i) => (
                  <li key={h.name}>{i + 1}. <b>{h.name}</b> — {h.qty} sold · {g(h.revenue)}g</li>
                ))}
                {!hottest.length && <li className="text-[#8a7c64]">No sales yet.</li>}
              </ul>
            </div>
            {trackStock && (
            <div>
              <h2 className="font-display text-lg">Running low</h2>
              <ul className="text-sm mt-2 space-y-1">
                {lowStock.slice(0, 6).map((s) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <span>{s.name} — {s.qty} left</span>
                    <form action={requestRestockAction} className="inline">
                      <input type="hidden" name="title" value={`Restock: ${s.name}`} />
                      <input type="hidden" name="body" value={`Only ${s.qty} left on hand.`} />
                      <button className="btn-ghost !py-0.5 !px-2 text-xs" type="submit" title="Post a stock request to the noticeboard">Request</button>
                    </form>
                  </li>
                ))}
                {!lowStock.length && <li className="text-[#8a7c64]">Nothing running low.</li>}
              </ul>
            </div>
            )}
          </div>
          <div className="mt-2 flex gap-3">
            <Link href="/admin/sales" className="text-sm text-[#c9a227]">All sales →</Link>
            {trackStock && <Link href="/admin/stock" className="text-sm text-[#c9a227]">Manage stock →</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}
