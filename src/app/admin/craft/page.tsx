import Link from "next/link";
import ConfirmButton from "@/components/ConfirmButton";
import CraftPanel from "@/components/CraftPanel";
import { Empty, Notice, PageHeader, Section } from "@/components/store-ui";
import SuggestInput from "@/components/SuggestInput";
import { g } from "@/lib/format";
import { isManager, requireStaff } from "@/lib/store-access";
import { deleteCraftAction } from "@/lib/store-actions";
import { listCrafts, listRecipes, type Recipe } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Craft({ searchParams }: { searchParams: Promise<{ error?: string; q?: string; recipe?: string }> }) {
  const access = await requireStaff();
  const manager = isManager(access);
  const { error, q, recipe } = await searchParams;
  const search = q?.trim().toLowerCase();
  const [recipes, crafts] = await Promise.all([listRecipes(access.profileId), listCrafts(access.profileId)]);

  const trades = new Map<string, Recipe[]>();
  for (const r of recipes) {
    if (search && !`${r.name} ${r.parts}`.toLowerCase().includes(search)) continue;
    const trade = r.profession ?? "Other";
    trades.set(trade, [...(trades.get(trade) ?? []), r]);
  }

  return (
    <>
      <PageHeader title="Craft" subtitle="Materials come off the shelf, the finished item goes on it.">
        <form className="flex gap-2">
          <SuggestInput name="q" defaultValue={q} options={recipes.flatMap((r) => [r.name, ...r.lines.map((l) => l.name)])} className="w-48" placeholder="Filter by name or part" label="Filter recipes" />
          <button className="btn-ghost !py-2 text-sm" type="submit">Search</button>
        </form>
      </PageHeader>
      <Notice error={error} />

      {recipes.length > 0 && <CraftPanel key={recipe} recipes={recipes} initial={recipe} />}

      {!trades.size && <div className="panel mb-8"><Empty>{search ? "No recipe matches." : "No recipes yet. Add one to an item on the Items page."}</Empty></div>}
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
                <Link href={`/admin/craft?${new URLSearchParams({ ...(q && { q }), recipe: r.id })}`} className="btn-ghost !py-1 text-sm" aria-label={`Select ${r.name}`}>Select</Link>
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
