import ConfirmButton from "@/components/ConfirmButton";
import { Empty, Notice, PageHeader, Section } from "@/components/store-ui";
import { g } from "@/lib/format";
import { isManager, requireStaff } from "@/lib/store-access";
import { craftAction, deleteCraftAction } from "@/lib/store-actions";
import { listCrafts, listRecipes, type Recipe } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Craft({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await requireStaff();
  const manager = isManager(access);
  const { error } = await searchParams;
  const [recipes, crafts] = await Promise.all([listRecipes(access.profileId), listCrafts(access.profileId)]);

  const trades = new Map<string, Recipe[]>();
  for (const r of recipes) {
    const trade = r.profession ?? "Other";
    trades.set(trade, [...(trades.get(trade) ?? []), r]);
  }

  return (
    <>
      <PageHeader title="Craft" subtitle="Materials come off the shelf, the finished item goes on it." />
      <Notice error={error} />

      {!recipes.length && <div className="panel mb-8"><Empty>No recipes yet. Add one to an item on the Items page.</Empty></div>}
      {[...trades.entries()].map(([trade, list]) => (
        <Section key={trade} title={trade} aside={list.length === 1 ? "1 recipe" : `${list.length} recipes`}>
          <div className="panel divide-y divide-[#1c2b31]">
            {list.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 basis-56">
                  {r.name}
                  {r.craft_yield > 1 && <span className="muted text-xs"> · makes {g(r.craft_yield)} per craft</span>}
                  <span className="muted text-xs block">{r.parts}</span>
                  <span className={`text-xs block ${r.max_qty ? "muted" : "text-[#e0bd4a]"}`}>
                    In stock {g(r.stock)} · {r.max_qty ? `materials for ${r.max_qty}` : `not enough ${r.limiting ?? "materials"}`}
                  </span>
                </span>
                <form action={craftAction} className="flex gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="qty" inputMode="decimal" defaultValue={g(r.craft_yield)} className="input !w-16 !py-1 text-sm" aria-label={`How many ${r.name}`} />
                  <button className="btn-gold !py-1 text-sm" type="submit">Craft</button>
                </form>
              </div>
            ))}
          </div>
        </Section>
      ))}

      <Section title="Latest crafts">
        <div className="panel divide-y divide-[#1c2b31]">
          {!crafts.length && <Empty>Nothing crafted yet.</Empty>}
          {crafts.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                {g(c.quantity)}× {c.good_name}
                <span className="muted text-xs block truncate">{new Date(c.created_at).toISOString().slice(0, 10)}{c.created_by_name ? ` · ${c.created_by_name}` : ""}</span>
              </span>
              {manager && (
                <form action={deleteCraftAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmButton className="btn-ghost !py-1 !px-2 text-sm" message={`Undo this craft of ${c.good_name}? Materials go back on the shelf.`}>×</ConfirmButton>
                </form>
              )}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
