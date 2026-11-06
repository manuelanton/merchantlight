"use client";

import { useState } from "react";
import SuggestInput from "@/components/SuggestInput";
import { g, num } from "@/lib/format";
import { craftAction } from "@/lib/store-actions";
import type { Recipe } from "@/lib/store-data";

/** Pick a recipe and an amount, see what it takes off the shelf before anything happens, as on the Tavern's Cook page. */
export default function CraftPanel({ recipes, initial, initialQty }: { recipes: Recipe[]; initial?: string; initialQty?: string }) {
  const [id, setId] = useState(initial ?? "");
  const recipe = recipes.find((r) => r.id === id);
  const [qty, setQty] = useState(initialQty ?? (recipe ? g(recipe.craft_yield) : "1"));

  const amount = num(qty);
  const perCraft = Math.max(recipe?.craft_yield ?? 1, 1);
  const crafts = Math.ceil(amount / perCraft);
  const made = crafts * perCraft;

  return (
    <div className="panel p-4 mb-8">
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto] gap-3 items-end">
        <div className="min-w-0">
          <label className="lbl" htmlFor="craft-recipe">Recipe</label>
          <SuggestInput
            key={recipe?.name}
            id="craft-recipe"
            label="Recipe"
            placeholder="Search recipes"
            defaultValue={recipe?.name}
            options={recipes.map((r) => r.name)}
            onPick={(name) => {
              const picked = recipes.find((r) => r.name === name);
              setId(picked?.id ?? "");
              setQty(g(picked?.craft_yield ?? 1));
            }}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="craft-qty">Amount</label>
          <input id="craft-qty" form="craft" name="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="input !py-2 text-sm" />
        </div>
        <form id="craft" action={craftAction}>
          <input type="hidden" name="id" value={id} />
          <button className="btn-gold !py-2 text-sm" type="submit" disabled={!recipe || amount <= 0}>Craft</button>
        </form>
      </div>

      {recipe && amount > 0 && (
        <div className="overflow-x-auto mt-4">
          <table className="ledger min-w-[28rem]">
            <thead><tr><th>Part</th><th className="text-right">Need</th><th className="text-right">In stock</th><th className="text-right">After</th></tr></thead>
            <tbody>
              {recipe.lines.map((l) => {
                const need = l.quantity * crafts;
                const after = l.stock - need;
                return (
                  <tr key={l.name}>
                    <td>{l.name}</td>
                    <td className="text-right tabular-nums">{g(need)}</td>
                    <td className="text-right tabular-nums muted">{g(l.stock)}</td>
                    <td className={`text-right tabular-nums ${after < 0 ? "text-[#e08a8a]" : ""}`}>{g(after)}</td>
                  </tr>
                );
              })}
              <tr>
                <td>{recipe.name}</td>
                <td className="text-right tabular-nums">+{g(made)}</td>
                <td className="text-right tabular-nums muted">{g(recipe.stock)}</td>
                <td className="text-right tabular-nums text-[#e0bd4a]">{g(recipe.stock + made)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
