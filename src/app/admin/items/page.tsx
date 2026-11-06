import Link from "next/link";
import { Empty, Notice, PageHeader, Section } from "@/components/store-ui";
import SuggestInput from "@/components/SuggestInput";
import { g } from "@/lib/format";
import { isManager, requireStaff } from "@/lib/store-access";
import { saveItemAction, saveMaterialAction } from "@/lib/store-actions";
import { listItems, listMaterials } from "@/lib/store-data";

export const dynamic = "force-dynamic";

const LOW_MARGIN = 0.3;
const COLUMNS = [
  { key: "name", label: "Item" },
  { key: "category", label: "Category" },
  { key: "cost", label: "Cost", number: true },
  { key: "price", label: "Price", number: true },
  { key: "profit", label: "Profit", number: true },
  { key: "margin", label: "Margin", number: true },
] as const;
type SortKey = (typeof COLUMNS)[number]["key"];

export default async function Items({ searchParams }: { searchParams: Promise<{ error?: string; q?: string; cat?: string; sort?: string; dir?: string }> }) {
  const access = await requireStaff();
  const manager = isManager(access);
  const { error, q, cat, sort, dir } = await searchParams;
  const [goods, materials] = await Promise.all([listItems(access.profileId), listMaterials(access.profileId)]);
  const search = q?.trim().toLowerCase();
  const shownMaterials = search ? materials.filter((m) => m.name.toLowerCase().includes(search)) : materials;

  const key: SortKey = COLUMNS.find((c) => c.key === sort)?.key ?? "name";
  const down = dir === "desc";
  const rows = goods
    .filter((i) => (!cat || i.category === cat) && (!search || i.name.toLowerCase().includes(search)))
    .map((i) => {
      const cost = i.unit_cost ?? 0;
      const profit = i.sell_price - cost;
      return { ...i, cost, price: i.sell_price, profit, margin: i.sell_price ? profit / i.sell_price : null };
    })
    .sort((a, b) => {
      const [x, y] = [a[key] ?? -1, b[key] ?? -1];
      const order = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y)) : x - y;
      return down ? -order : order;
    });
  const categories = [...new Set(goods.map((i) => i.category))].sort();

  const link = (change: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, cat, sort, dir, ...change })) if (v) params.set(k, v);
    return `/admin/items?${params}`;
  };

  return (
    <>
      <PageHeader title="Items" subtitle="Cost comes from the recipe. Margins under 30% are flagged.">
        <form className="flex gap-2">
          {cat && <input type="hidden" name="cat" value={cat} />}
          <SuggestInput name="q" defaultValue={q} options={[...goods, ...materials].map((i) => i.name)} className="w-48" placeholder="Search items" label="Search items" />
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
            <div><label className="lbl" htmlFor="buy_price">Purchase</label><input id="buy_price" name="buy_price" inputMode="decimal" className="input" /></div>
            <div><label className="lbl" htmlFor="min_stock">Low at</label><input id="min_stock" name="min_stock" inputMode="decimal" className="input" /></div>
            <button className="btn-gold !py-2 text-sm" type="submit">Add</button>
            <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </form>
        </details>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <Link href={link({ cat: undefined })} className={`${cat ? "btn-ghost" : "btn-gold"} !py-1 text-sm`}>All</Link>
        {categories.map((c) => (
          <Link key={c} href={link({ cat: c })} className={`${c === cat ? "btn-gold" : "btn-ghost"} !py-1 text-sm`}>{c}</Link>
        ))}
      </div>

      <div className="panel overflow-x-auto mb-8">
        <table className="ledger min-w-[40rem]">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={"number" in c ? "text-right" : undefined} aria-sort={c.key === key ? (down ? "descending" : "ascending") : undefined}>
                  <Link href={link({ sort: c.key, dir: c.key === key && !down ? "desc" : undefined })}>
                    {c.label}{c.key === key ? (down ? " ↓" : " ↑") : ""}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const low = !i.cost_error && i.margin !== null && i.margin < LOW_MARGIN;
              return (
                <tr key={i.id}>
                  <td><Link href={`/admin/items/${i.id}`} className="hover:text-[#e0bd4a]">{i.name}</Link>{i.is_bundle && <span className="muted text-xs"> · bundle</span>}{!i.on_menu && <span className="muted text-xs"> · off menu</span>}</td>
                  <td className="muted text-sm">{i.category}</td>
                  <td className="text-right tabular-nums">{i.cost_error ? <span className="text-[#e08a8a]">circular</span> : `${g(i.cost)}g`}</td>
                  <td className="text-right tabular-nums">{g(i.price)}g</td>
                  <td className="text-right tabular-nums">{i.cost_error ? "—" : `${g(i.profit)}g`}</td>
                  <td className={`text-right tabular-nums ${low ? "text-[#e0bd4a]" : ""}`}>{i.cost_error || i.margin === null ? "—" : `${Math.round(i.margin * 100)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <Empty>{search || cat ? "No item matches." : "No items yet."}</Empty>}
      </div>

      {(manager || shownMaterials.length > 0) && (
        <Section title="Raw materials" aside="Bought in and used in recipes. Switched on the menu, they sell at their price.">
          <div className="panel overflow-x-auto">
            <table className="ledger min-w-[36rem] table-fixed">
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="text-right w-24">Cost</th>
                  <th className="text-right w-24">Price</th>
                  <th className="text-right w-24">Low at</th>
                  <th className="text-right w-16">Menu</th>
                  {manager && <th className="w-20" />}
                </tr>
              </thead>
              <tbody>
                {shownMaterials.map((m) => {
                  const form = `material-${m.id}`;
                  return manager ? (
                    <tr key={m.id}>
                      <td><input form={form} name="name" defaultValue={m.name} className="input !py-1 text-sm" aria-label={`Name of ${m.name}`} required /></td>
                      <td><input form={form} name="buy_price" inputMode="decimal" defaultValue={g(m.buy_price)} className="input !py-1 text-sm text-right" aria-label={`Cost of ${m.name}`} /></td>
                      <td><input form={form} name="sell_price" inputMode="decimal" defaultValue={g(m.sell_price ?? m.buy_price)} className="input !py-1 text-sm text-right" aria-label={`Price of ${m.name}`} /></td>
                      <td><input form={form} name="min_stock" inputMode="decimal" defaultValue={g(m.min_stock)} className="input !py-1 text-sm text-right" aria-label={`Low at of ${m.name}`} /></td>
                      <td className="text-right"><input form={form} type="checkbox" name="on_menu" value="1" defaultChecked={m.on_menu} className="accent-[#d97a1f]" aria-label={`${m.name} on the menu`} /></td>
                      <td>
                        <form id={form} action={saveMaterialAction} className="flex justify-end">
                          <input type="hidden" name="id" value={m.id} />
                          <button className="btn-ghost !py-1 !px-2 text-sm" type="submit">Save</button>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={m.id}>
                      <td className="truncate">{m.name}</td>
                      <td className="text-right tabular-nums">{g(m.buy_price)}</td>
                      <td className="text-right tabular-nums">{g(m.sell_price ?? m.buy_price)}</td>
                      <td className="text-right tabular-nums">{g(m.min_stock)}</td>
                      <td className="text-right muted">{m.on_menu ? "Yes" : "No"}</td>
                    </tr>
                  );
                })}
                {manager && (
                  <tr>
                    <td><input form="material-new" name="name" className="input !py-1 text-sm" placeholder="New material" aria-label="New material" required /></td>
                    <td><input form="material-new" name="buy_price" inputMode="decimal" className="input !py-1 text-sm text-right" placeholder="0" aria-label="Cost of the new material" /></td>
                    <td><input form="material-new" name="sell_price" inputMode="decimal" className="input !py-1 text-sm text-right" placeholder="0" aria-label="Price of the new material" /></td>
                    <td><input form="material-new" name="min_stock" inputMode="decimal" className="input !py-1 text-sm text-right" placeholder="0" aria-label="Low at of the new material" /></td>
                    <td className="text-right"><input form="material-new" type="checkbox" name="on_menu" value="1" className="accent-[#d97a1f]" aria-label="New material on the menu" /></td>
                    <td>
                      <form id="material-new" action={saveMaterialAction} className="flex justify-end">
                        <button className="btn-gold !py-1 !px-2 text-sm" type="submit">Add</button>
                      </form>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  );
}
