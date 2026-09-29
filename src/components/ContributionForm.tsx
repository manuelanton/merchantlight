"use client";
import { useState } from "react";
import MemberSelect from "./MemberSelect";

/** Contribution form: pick member + optionally value it from catalogue items at cost. */
export default function ContributionForm({
  members,
  items,
}: {
  members: string[];
  items: { id: string; name: string; cost: number }[];
}) {
  const [withItems, setWithItems] = useState(false);
  const [rows, setRows] = useState([{ key: 0, itemId: items[0]?.id || "", qty: 1 }]);
  const [n, setN] = useState(1);
  const [manual, setManual] = useState("0");

  const costOf = (id: string) => items.find((i) => i.id === id)?.cost || 0;
  const autoTotal = rows.reduce((a, r) => a + r.qty * costOf(r.itemId), 0);

  const addRow = () => {
    setRows((r) => [...r, { key: n, itemId: items[0]?.id || "", qty: 1 }]);
    setN((x) => x + 1);
  };
  const setRow = (key: number, patch: Partial<{ itemId: string; qty: number }>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  const summary = rows
    .filter((r) => r.itemId && r.qty > 0)
    .map((r) => `${items.find((i) => i.id === r.itemId)?.name || "goods"} × ${r.qty}`)
    .join(", ");

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        <MemberSelect members={members} name="member" label="Member" required />
        <div>
          <label className="lbl">Amount (g) *</label>
          <input
            name="amount_gold" type="number" min={0} step="any" required className="input"
            value={withItems ? Math.round(autoTotal * 100) / 100 : manual}
            onChange={(e) => setManual(e.target.value)}
            readOnly={withItems}
            title={withItems ? "Auto-valued from items below — uncheck to type freely" : undefined}
          />
        </div>
        <div><label className="lbl">Category</label><input name="category" defaultValue="stock" className="input" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={withItems} onChange={(e) => setWithItems(e.target.checked)} className="accent-[#d97a1f]" />
        Value from items / materials
      </label>
      {withItems && (
        <div className="space-y-2 border-t border-[#1c2b31] pt-3">
          {rows.map((r) => (
            <div key={r.key} className="flex gap-2 items-center">
              <select
                name="contrib_item_id" className="input flex-1"
                value={r.itemId} onChange={(e) => setRow(r.key, { itemId: e.target.value })}
                aria-label="Contributed item"
              >
                {items.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.cost}g)</option>)}
              </select>
              <input
                name="contrib_qty" type="number" min={0.01} step="any" value={r.qty}
                onChange={(e) => setRow(r.key, { qty: Number(e.target.value) })}
                className="input w-24" aria-label="Quantity"
              />
              <button type="button" onClick={() => removeRow(r.key)} className="btn-ghost !px-2.5 shrink-0" title="Remove row">✕</button>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button type="button" onClick={addRow} className="btn-ghost !py-1 text-xs">+ Add row</button>
            <span className="text-sm text-[#8a7c64] ml-auto">Valued at: <b className="text-[#e0bd4a]">{Math.round(autoTotal * 100) / 100}g</b></span>
          </div>
          <input type="hidden" name="description_auto" value={summary} />
        </div>
      )}
    </div>
  );
}
