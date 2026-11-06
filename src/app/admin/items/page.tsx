import { Empty, Notice, PageHeader, Section } from "@/components/store-ui";
import { g } from "@/lib/format";
import { isManager, requireStaff } from "@/lib/store-access";
import { saveItemAction } from "@/lib/store-actions";
import { listGoods, type Good } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Items({ searchParams }: { searchParams: Promise<{ error?: string; q?: string }> }) {
  const access = await requireStaff();
  const manager = isManager(access);
  const { error, q } = await searchParams;
  const goods = await listGoods(access.profileId);
  const search = q?.trim().toLowerCase();
  const shown = search ? goods.filter((i) => i.name.toLowerCase().includes(search)) : goods;

  const groups = new Map<string, Good[]>();
  for (const i of shown) groups.set(i.category, [...(groups.get(i.category) ?? []), i]);

  return (
    <>
      <PageHeader title="Items" subtitle="What we sell and what it costs.">
        <form className="flex gap-2">
          <input name="q" defaultValue={q} className="input !w-48 !py-2 text-sm" placeholder="Search items" aria-label="Search items" />
          <button className="btn-ghost !py-2 text-sm" type="submit">Search</button>
        </form>
      </PageHeader>
      <Notice error={error} />

      {manager && (
        <details className="mb-6">
          <summary className="btn-ghost inline-block !py-2 text-sm cursor-pointer">+ New item</summary>
          <form action={saveItemAction} className="panel p-4 mt-3 grid sm:grid-cols-[2fr_1.2fr_1fr_1fr_1fr_auto] gap-3 items-end">
            <div><label className="lbl" htmlFor="name">Name</label><input id="name" name="name" className="input" required /></div>
            <div><label className="lbl" htmlFor="category">Category</label><input id="category" name="category" className="input" list="categories" /></div>
            <div><label className="lbl" htmlFor="sell_price">Price</label><input id="sell_price" name="sell_price" inputMode="decimal" className="input" /></div>
            <div><label className="lbl" htmlFor="buy_price">Cost</label><input id="buy_price" name="buy_price" inputMode="decimal" className="input" /></div>
            <div><label className="lbl" htmlFor="min_stock">Low at</label><input id="min_stock" name="min_stock" inputMode="decimal" className="input" /></div>
            <button className="btn-gold !py-2 text-sm" type="submit">Add</button>
            <datalist id="categories">{[...new Set(goods.map((i) => i.category))].map((c) => <option key={c} value={c} />)}</datalist>
          </form>
        </details>
      )}

      {!shown.length && <div className="panel"><Empty>{search ? "No item matches." : "No items yet."}</Empty></div>}
      {[...groups.entries()].map(([category, items]) => (
        <Section key={category} title={category} aside={items.length === 1 ? "1 item" : `${items.length} items`}>
          <div className="panel overflow-x-auto">
            <table className="ledger min-w-[34rem] table-fixed">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right w-24">Price</th>
                  <th className="text-right w-24">Cost</th>
                  <th className="text-right w-24">Low at</th>
                  {manager && <th className="w-20" />}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const form = `item-${i.id}`;
                  const cell = (name: string, label: string, value: number | null) => (
                    <td className="text-right tabular-nums">
                      {manager
                        ? <input form={form} name={name} inputMode="decimal" defaultValue={g(value ?? 0)} className="input !py-1 text-sm text-right" aria-label={`${label} of ${i.name}`} />
                        : g(value ?? 0)}
                    </td>
                  );
                  return (
                    <tr key={i.id}>
                      <td className="truncate">
                        {manager
                          ? <input form={form} name="name" defaultValue={i.name} className="input !py-1 text-sm" aria-label={`Name of ${i.name}`} required />
                          : <>{i.name}{i.is_bundle && <span className="muted text-xs"> · bundle</span>}</>}
                      </td>
                      {cell("sell_price", "Price", i.sell_price)}
                      {cell("buy_price", "Cost", i.buy_price)}
                      {cell("min_stock", "Low at", i.min_stock)}
                      {manager && (
                        <td>
                          <form id={form} action={saveItemAction} className="flex justify-end">
                            <input type="hidden" name="id" value={i.id} />
                            <input type="hidden" name="category" value={i.category} />
                            <button className="btn-ghost !py-1 !px-2 text-sm" type="submit">Save</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
    </>
  );
}
