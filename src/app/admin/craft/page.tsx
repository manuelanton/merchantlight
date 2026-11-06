import Link from "next/link";
import ConfirmButton from "@/components/ConfirmButton";
import CraftPanel from "@/components/CraftPanel";
import CraftRequestForm from "@/components/CraftRequestForm";
import { Empty, Notice, PageHeader, Section } from "@/components/store-ui";
import SuggestInput from "@/components/SuggestInput";
import { g } from "@/lib/format";
import { isManager, requireStaff } from "@/lib/store-access";
import { cancelCraftRequestAction, deleteCraftAction } from "@/lib/store-actions";
import { isLow, listCraftRequests, listCrafts, listRecipes, type Recipe } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Craft({ searchParams }: { searchParams: Promise<{ error?: string; q?: string; recipe?: string; qty?: string; request?: string }> }) {
  const access = await requireStaff();
  const manager = isManager(access);
  const { error, q, recipe, qty, request } = await searchParams;
  const search = q?.trim().toLowerCase();
  const [recipes, crafts, requests] = await Promise.all([listRecipes(access.profileId), listCrafts(access.profileId), listCraftRequests(access.profileId)]);

  // Low on stock, craftable, and nobody has asked for it yet.
  const asked = new Set(requests.map((r) => r.good_id));
  const suggestions = manager ? recipes.filter((r) => isLow(r) && !asked.has(r.id)) : [];
  const refill = (r: Recipe) => Math.max(1, Math.ceil(r.min_stock * 2 - r.stock));
  const preset = recipes.find((r) => r.id === request);

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
        </form>
      </PageHeader>
      <Notice error={error} />

      {recipes.length > 0 && <CraftPanel key={`${recipe}-${qty}`} recipes={recipes} initial={recipe} initialQty={qty} />}

      <Section title="Craft requests" aside={requests.length ? `${requests.length} open` : undefined}>
        {manager && <CraftRequestForm key={request} recipes={recipes.map((r) => ({ id: r.id, name: r.name }))} preset={preset && { id: preset.id, qty: refill(preset) }} />}
        <div className="panel divide-y divide-[#1c2b31]">
          {!requests.length && <Empty>Nothing requested right now.</Empty>}
          {requests.map((r) => {
            const left = Math.max(0, r.quantity - r.fulfilled);
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="truncate">{r.name}</span>
                    <span className="muted text-sm tabular-nums">{g(r.fulfilled)} / {g(r.quantity)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#1c2b31] overflow-hidden mt-1.5 max-w-xs">
                    <div className="h-full rounded-full bg-[#b08c12]" style={{ width: `${Math.max(3, (r.fulfilled / r.quantity) * 100)}%` }} />
                  </div>
                  <p className="muted text-xs mt-1">
                    In stock {g(r.stock)} · asked by {r.requested_by ?? "Unknown"} · {new Date(r.created_at).toISOString().slice(0, 10)}{r.note && ` · ${r.note}`}
                  </p>
                </div>
                <Link href={`/admin/craft?${new URLSearchParams({ recipe: r.good_id, qty: g(left) })}`} className="btn-gold !py-1 text-sm shrink-0">Craft {g(left)}</Link>
                {manager && (
                  <form action={cancelCraftRequestAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <ConfirmButton message={`Cancel the request for ${r.name}?`} className="btn-ghost !py-1 !px-2 text-sm"><span aria-label={`Cancel the request for ${r.name}`}>×</span></ConfirmButton>
                  </form>
                )}
              </div>
            );
          })}
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
            <span className="muted">Low on stock:</span>
            {suggestions.map((r) => (
              <Link key={r.id} href={`/admin/craft?request=${r.id}`} className="btn-ghost !py-1 !px-2 text-xs">{r.name} ({g(r.stock)}) · request</Link>
            ))}
          </div>
        )}
      </Section>

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
