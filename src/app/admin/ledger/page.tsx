import { deleteLedgerAction, updateLedgerAction } from "@/lib/admin-actions";
import { getBooks } from "@/lib/books";
import { g } from "@/lib/format";
import { getCatalogue } from "@/lib/catalog";
import LedgerAddForm from "@/components/LedgerAddForm";
import MemberSelect from "@/components/MemberSelect";

export const dynamic = "force-dynamic";

// sale_income rows are system-posted (every sale) — not offered as a manual choice.
const TYPES = ["contribution", "expense", "payout"] as const;

export default async function LedgerPage() {
  const b = await getBooks();
  const { items } = await getCatalogue();
  const bal = b.ledgerRows.reduce((a, e) => a + e.amountGold, 0);

  type Row = (typeof b.ledgerRows)[number];
  interface Group {
    key: string;
    kind: "sale" | "shared";
    when: string;
    rows: Row[];
    total: number;
    title: string;
  }
  // Collapse auto-posted split shares into one expandable row per sale / bill.
  const singles: Row[] = [];
  const groups = new Map<string, Group>();
  const groupOrder: string[] = [];
  const saleToken = (d: string) => d.match(/\[sale:([^\]]+)\]/)?.[1];
  // Shared bills (rent splits, shared costs): same text modulo the share tag,
  // with or without parentheses around it.
  const SHARE_TAG = /:?\s*\(?share \d+ of \d+[^)]*\)?/i;
  const sharedBill = (d: string) => {
    if (!/share \d+ of \d+/i.test(d)) return null;
    return d.replace(SHARE_TAG, "").trim();
  };
  const groupKeyFor = (e: Row): string | null => {
    if (e.type === "sale_income") {
      const tok = saleToken(e.description);
      return tok ? `sale:${tok}` : null;
    }
    const bill = sharedBill(e.description);
    return bill ? `shared:${bill}` : null;
  };
  const groupTitleFor = (kind: Group["kind"], rows: Row[]): string => {
    if (kind === "sale") {
      return rows[0]?.description.replace(/\[sale:[^\]]+\]:\s*/, "").replace(/\s*\(share \d+ of \d+\)\s*$/, "") || "Sale";
    }
    const first = rows[0]?.description || "";
    const total = first.match(/of ([\d.]+)g/i)?.[1];
    const what = first.replace(SHARE_TAG, "").replace(/^(Shared|Rent split:?)\s*/i, "").trim() || first.replace(SHARE_TAG, "").trim();
    return total ? `${what} — split of ${total}g` : what || "Shared cost";
  };
  for (const e of b.ledgerRows) {
    const key = groupKeyFor(e);
    if (!key) {
      singles.push(e);
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, {
        key, kind: key.startsWith("sale:") ? "sale" : "shared",
        when: String(e.timestamp), rows: [], total: 0, title: "",
      });
      groupOrder.push(key);
    }
    const gr = groups.get(key)!;
    gr.rows.push(e);
    gr.total += e.amountGold;
  }
  // Interleave back into time order (rows come newest-first).
  const order = new Map<string, number>();
  b.ledgerRows.forEach((e, i) => {
    const k = groupKeyFor(e) || `row:${e.id}`;
    if (!order.has(k)) order.set(k, i);
  });
  for (const gr of groups.values()) {
    if (!gr.title) gr.title = groupTitleFor(gr.kind, gr.rows);
  }
  const feed: ({ t: "single"; row: Row } | { t: "group"; group: Group })[] = [
    ...singles.map((row) => ({ t: "single" as const, row })),
    ...groupOrder.map((k) => ({ t: "group" as const, group: groups.get(k)! })),
  ].sort((a, c) => {
    const ka = a.t === "single" ? `row:${a.row.id}` : a.group.key;
    const kc = c.t === "single" ? `row:${c.row.id}` : c.group.key;
    return (order.get(ka) ?? 0) - (order.get(kc) ?? 0);
  });

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

      <LedgerAddForm
        members={b.members}
        items={items.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name, cost: i.cost_value > 0 ? i.cost_value : i.sale_price }))}
      />

      <div className="card overflow-x-auto">
        <table className="ledger min-w-[820px]">
          <thead><tr><th>When</th><th>Type</th><th>Member</th><th>Amount</th><th>Category</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {feed.map((entry) => {
              if (entry.t === "group") {
                const gr = entry.group;
                const pos = gr.total >= 0;
                return (
                  <tr key={gr.key}>
                    <td className="text-xs">{new Date(gr.when).toLocaleString()}</td>
                    <td>{gr.kind === "sale" ? "sale split" : "shared"}</td>
                    <td className="text-[#8a7c64]">{gr.rows.length} members</td>
                    <td className={pos ? "text-[#7fd08a]" : "text-[#e08a8a]"}>{g(gr.total)}g</td>
                    <td>{gr.rows[0]?.category || ""}</td>
                    <td className="text-[#8a7c64]">
                      <details>
                        <summary className="cursor-pointer hover:text-[#e8dcc4]">{gr.title}</summary>
                        <ul className="mt-1 space-y-0.5 text-xs">
                          {gr.rows.map((r) => (
                            <li key={r.id} className="flex items-center gap-2">
                              <span>{r.member}: {g(r.amountGold)}g</span>
                              {gr.kind === "shared" && (
                                <form action={deleteLedgerAction} className="inline">
                                  <input type="hidden" name="id" value={r.id} />
                                  <button className="btn-ghost !py-0 !px-1.5 text-xs" type="submit" title="Delete this share">✕</button>
                                </form>
                              )}
                            </li>
                          ))}
                        </ul>
                        {gr.kind === "sale" && (
                          <p className="text-xs mt-1">Change via voiding the sale on the Sales page.</p>
                        )}
                      </details>
                    </td>
                    <td />
                  </tr>
                );
              }
              const e = entry.row;
              return (
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
                      <div><label className="lbl">Amount (g)</label><input name="amount_gold" type="number" step="any" defaultValue={Math.abs(e.amountGold)} className="input" /></div>
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
              );
            })}
            {!feed.length && <tr><td colSpan={7} className="text-[#8a7c64]">Ledger is empty — log the seed capital first.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
