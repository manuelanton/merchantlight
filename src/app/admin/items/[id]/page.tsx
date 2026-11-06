import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, Notice, PageHeader, Section, Stat } from "@/components/store-ui";
import { g } from "@/lib/format";
import { isManager, requireStaff } from "@/lib/store-access";
import { addRecipeLineAction, removeRecipeLineAction, saveRecipeAction } from "@/lib/store-actions";
import { getGood, listGoods, listMaterials, recipeLines } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Item({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const access = await requireStaff();
  const manager = isManager(access);
  const { id } = await params;
  const { error } = await searchParams;
  const good = /^[0-9a-f-]{36}$/.test(id) ? await getGood(access.profileId, id) : null;
  if (!good) notFound();
  const [lines, goods, materials] = await Promise.all([recipeLines(access.profileId, id), listGoods(access.profileId), listMaterials(access.profileId)]);

  const others = goods.filter((i) => i.id !== id);
  const trades = [...new Set(goods.map((i) => i.profession).filter(Boolean))] as string[];
  const margin = good.sell_price - (good.unit_cost ?? 0);

  return (
    <div className="max-w-3xl">
      <PageHeader title={good.name} subtitle={`${good.category}${good.profession ? ` · ${good.profession}` : ""}`}>
        <Link href="/admin/items" className="btn-ghost !py-2 text-sm">← All items</Link>
      </PageHeader>
      <Notice error={error ?? good.cost_error ?? undefined} />

      <div className="grid grid-cols-3 gap-3 mb-2">
        <Stat label="Price" value={`${g(good.sell_price)}g`} />
        <Stat label={lines.length ? "Recipe cost" : "Cost"} value={`${g(good.unit_cost ?? 0)}g`} />
        <Stat label="Margin" value={`${g(margin)}g`} tone={margin < 0 ? "bad" : undefined} />
      </div>
      <p className="muted text-xs mb-8">
        {lines.length
          ? "Sells, can be bought in and can be crafted. With a recipe, the profit counts the recipe cost, also for pieces bought in."
          : "Sells and can be bought in. Add a recipe to make it craftable."}
      </p>

      <Section title="Recipe" aside={good.craft_yield > 1 ? `makes ${g(good.craft_yield)} per craft` : undefined}>
        <div className="panel overflow-x-auto mb-3">
          <table className="ledger">
            <thead><tr><th>Part</th><th className="text-right">Qty</th><th className="text-right">In stock</th>{manager && <th />}</tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td>
                  <td className="text-right tabular-nums">{g(l.quantity)}</td>
                  <td className="text-right tabular-nums">{g(l.stock)}</td>
                  {manager && (
                    <td className="text-right">
                      <form action={removeRecipeLineAction}>
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="good" value={id} />
                        <button className="btn-ghost !py-1 !px-2 text-sm" type="submit" aria-label={`Remove ${l.name}`}>×</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!lines.length && <Empty>No recipe yet.</Empty>}
        </div>

        {manager && (
          <form action={addRecipeLineAction} className="panel p-4 grid grid-cols-[1fr_5rem_auto] gap-3 items-end mb-3">
            <input type="hidden" name="good" value={id} />
            <div className="min-w-0">
              <label className="lbl" htmlFor="part">Add a part</label>
              <select id="part" name="part" className="input" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {materials.length > 0 && <optgroup label="Raw materials">{materials.map((m) => <option key={m.id} value={`material:${m.id}`}>{m.name}</option>)}</optgroup>}
                {others.length > 0 && <optgroup label="Items">{others.map((i) => <option key={i.id} value={`good:${i.id}`}>{i.name}</option>)}</optgroup>}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="quantity">Qty</label>
              <input id="quantity" name="quantity" inputMode="decimal" defaultValue="1" className="input" />
            </div>
            <button className="btn-gold !py-2 text-sm" type="submit">Add</button>
          </form>
        )}

        {manager && (
          <form action={saveRecipeAction} className="panel p-4 grid grid-cols-[1fr_5rem_auto] gap-3 items-end">
            <input type="hidden" name="good" value={id} />
            <div className="min-w-0">
              <label className="lbl" htmlFor="profession">Crafted by</label>
              <input id="profession" name="profession" list="trades" defaultValue={good.profession ?? ""} className="input" placeholder="Tailor" />
              <datalist id="trades">{trades.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <div>
              <label className="lbl" htmlFor="craft_yield">Yield</label>
              <input id="craft_yield" name="craft_yield" inputMode="decimal" defaultValue={g(good.craft_yield)} className="input" />
            </div>
            <button className="btn-ghost !py-2 text-sm" type="submit">Save</button>
          </form>
        )}
      </Section>
    </div>
  );
}
