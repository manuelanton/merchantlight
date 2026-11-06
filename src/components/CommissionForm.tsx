"use client";

import { useState } from "react";
import SuggestInput from "@/components/SuggestInput";
import { g, num } from "@/lib/format";
import { addCommissionAction } from "@/lib/store-actions";
import type { EecItem } from "@/lib/store-data";

/** A customer's order: pick items from the EEC list, each with its amount. */
export default function CommissionForm({ items }: { items: EecItem[] }) {
  const [lines, setLines] = useState<{ id: string; qty: string }[]>([]);
  const [picks, setPicks] = useState(0);

  const chosen = lines.flatMap((l) => {
    const item = items.find((i) => i.id === l.id);
    return item ? [{ ...l, item, amount: Math.floor(num(l.qty)) }] : [];
  });
  const total = chosen.reduce((sum, l) => sum + l.amount * l.item.price, 0);
  const valid = chosen.length > 0 && chosen.every((l) => l.amount > 0);

  return (
    <form
      action={async (data) => {
        await addCommissionAction(data);
        setLines([]);
      }}
      className="panel p-4 grid gap-3"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="lbl" htmlFor="commission-customer">Customer name</label>
          <input id="commission-customer" name="customer" maxLength={60} className="input !py-2 text-sm" required />
        </div>
        <div>
          <label className="lbl" htmlFor="commission-item">Add item</label>
          <SuggestInput
            key={picks}
            id="commission-item"
            autoFocus={picks > 0}
            label="Add item"
            placeholder="Search the EEC list"
            options={items.map((i) => i.name)}
            onPick={(name) => {
              const item = items.find((i) => i.name === name);
              if (item && !lines.some((l) => l.id === item.id)) setLines([...lines, { id: item.id, qty: "1" }]);
              setPicks(picks + 1);
            }}
          />
        </div>
      </div>

      {chosen.length > 0 && (
        <div className="overflow-x-auto">
          <table className="ledger min-w-[30rem]">
            <thead><tr><th>Item</th><th className="text-right w-20">Amount</th><th className="text-right">Price</th><th className="text-right">Total</th><th className="w-10" /></tr></thead>
            <tbody>
              {chosen.map((l) => (
                <tr key={l.id}>
                  <td>{l.item.name}{l.item.weekly_limit && <span className="muted text-xs"> · at most {l.item.weekly_limit} a week</span>}</td>
                  <td>
                    <input
                      inputMode="numeric"
                      value={l.qty}
                      onChange={(e) => setLines(lines.map((x) => (x.id === l.id ? { ...x, qty: e.target.value } : x)))}
                      className="input !py-1 text-sm text-right"
                      aria-label={`Amount of ${l.item.name}`}
                    />
                  </td>
                  <td className="text-right tabular-nums">{g(l.item.price)}g</td>
                  <td className="text-right tabular-nums">{g(l.amount * l.item.price)}g</td>
                  <td className="text-right">
                    <button type="button" className="btn-ghost !py-1 !px-2 text-sm" onClick={() => setLines(lines.filter((x) => x.id !== l.id))} aria-label={`Take out ${l.item.name}`}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <input type="hidden" name="lines" value={JSON.stringify(chosen.map((l) => ({ item: l.id, qty: l.amount })))} />
      <div className="flex items-center justify-end gap-3">
        {chosen.length > 0 && <span className="tabular-nums text-sm">Total {g(total)}g</span>}
        <button className="btn-gold !py-2 text-sm" type="submit" disabled={!valid}>Add order</button>
      </div>
    </form>
  );
}
