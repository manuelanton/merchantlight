"use client";

import { useState } from "react";
import SuggestInput from "@/components/SuggestInput";
import { requestCraftAction } from "@/lib/store-actions";

/** Ask for an item to be crafted. `preset` comes from a low-stock suggestion. */
export default function CraftRequestForm({ recipes, preset }: {
  recipes: { id: string; name: string }[];
  preset?: { id: string; qty: number };
}) {
  const [id, setId] = useState(preset?.id ?? "");
  const [qty, setQty] = useState(String(preset?.qty ?? 10));

  return (
    <details className="mb-3" open={!!preset}>
      <summary className="btn-ghost inline-block !py-2 text-sm cursor-pointer">+ Request crafting</summary>
      <form action={requestCraftAction} className="panel p-4 mt-3 grid sm:grid-cols-[2fr_6rem_2fr_auto] gap-3 items-end">
        <div>
          <label className="lbl" htmlFor="request-what">What</label>
          <SuggestInput
            id="request-what"
            label="What to craft"
            placeholder="Search recipes"
            defaultValue={recipes.find((r) => r.id === id)?.name}
            options={recipes.map((r) => r.name)}
            onPick={(name) => setId(recipes.find((r) => r.name === name)?.id ?? "")}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="request-qty">How many</label>
          <input id="request-qty" name="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="input !py-2 text-sm" />
        </div>
        <div>
          <label className="lbl" htmlFor="request-note">Note</label>
          <input id="request-note" name="note" className="input !py-2 text-sm" placeholder="Optional, e.g. for the weekend" />
        </div>
        <input type="hidden" name="good" value={id} />
        <button className="btn-gold !py-2 text-sm" type="submit" disabled={!id}>Send request</button>
      </form>
    </details>
  );
}
