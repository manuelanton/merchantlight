"use client";

import { useState } from "react";
import { g, num } from "@/lib/format";
import { mintAction } from "@/lib/store-actions";
import type { Mintable } from "@/lib/store-data";

/** Send ingots to the mint; the total updates as you type. */
export default function MintForm({ ingots, manager }: { ingots: Mintable[]; manager: boolean }) {
  const [id, setId] = useState(ingots[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("");
  const ingot = ingots.find((i) => i.id === id);
  const usedRate = rate.trim() ? num(rate) : ingot?.mint_rate ?? 0;
  const amount = Math.floor(num(qty)) * usedRate;

  return (
    <form
      action={async (data) => {
        await mintAction(data);
        setQty("1");
        setRate("");
      }}
      className="panel p-4 grid sm:grid-cols-[2fr_6rem_7rem_2fr_auto] gap-3 items-end"
    >
      <div>
        <label className="lbl" htmlFor="mint-ingot">Ingot</label>
        <select id="mint-ingot" name="material" value={id} onChange={(e) => setId(e.target.value)} className="input !py-2 text-sm" required>
          {ingots.map((i) => <option key={i.id} value={i.id}>{i.name} · {g(i.stock)} in stock</option>)}
        </select>
      </div>
      <div>
        <label className="lbl" htmlFor="mint-qty">Ingots</label>
        <input id="mint-qty" name="qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="input !py-2 text-sm text-right" required />
      </div>
      <div>
        <label className="lbl" htmlFor="mint-rate">Septims each</label>
        <input id="mint-rate" name="rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={ingot ? g(ingot.mint_rate) : ""} className="input !py-2 text-sm text-right" />
      </div>
      <div>
        <label className="lbl" htmlFor="mint-note">Note</label>
        <input id="mint-note" name="note" maxLength={120} className="input !py-2 text-sm" placeholder="Optional" />
      </div>
      <button className="btn-gold !py-2 text-sm" type="submit" disabled={!ingot || amount <= 0}>Mint {g(amount)}g</button>
      {manager && (
        <div className="sm:col-span-2">
          <label className="lbl" htmlFor="mint-date">Date</label>
          <input id="mint-date" name="date" type="datetime-local" className="input !py-2 text-sm" aria-describedby="mint-date-hint" />
          <p id="mint-date-hint" className="muted text-xs mt-1">Leave empty for now. Times are UTC.</p>
        </div>
      )}
    </form>
  );
}
