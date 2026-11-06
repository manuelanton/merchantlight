import Link from "next/link";
import { Notice, PageHeader, Stat } from "@/components/store-ui";
import SuggestInput from "@/components/SuggestInput";
import { g } from "@/lib/format";
import { isManager, requireStaff } from "@/lib/store-access";
import { setStockAction } from "@/lib/store-actions";
import { isLow, listGoods, listMaterials } from "@/lib/store-data";

export const dynamic = "force-dynamic";

interface Row {
  kind: "good" | "material";
  id: string;
  name: string;
  category: string;
  stock: number;
  min_stock: number;
  value: number;
  total: number;
}

const COLUMNS = [
  { key: "name", label: "Item" },
  { key: "category", label: "Category" },
  { key: "stock", label: "In stock", number: true },
  { key: "value", label: "Value", number: true },
  { key: "total", label: "Total", number: true },
] as const;
type SortKey = (typeof COLUMNS)[number]["key"];

const total = (rows: Row[]) => rows.reduce((sum, r) => sum + r.total, 0);

export default async function Stock({ searchParams }: { searchParams: Promise<{ error?: string; q?: string; cat?: string; sort?: string; dir?: string }> }) {
  const access = await requireStaff();
  const manager = isManager(access);
  const { error, q, cat, sort, dir } = await searchParams;
  const search = q?.trim().toLowerCase();
  const [goods, materials] = await Promise.all([listGoods(access.profileId), listMaterials(access.profileId)]);

  // Bundles have no shelf of their own: selling one takes its parts.
  const all: Row[] = [
    ...goods
      .filter((i) => !i.is_bundle)
      .map((i) => ({ kind: "good" as const, id: i.id, name: i.name, category: i.category, stock: i.stock, min_stock: i.min_stock, value: i.sell_price, total: i.stock * i.sell_price })),
    ...materials.map((m) => ({ kind: "material" as const, id: m.id, name: m.name, category: "Raw materials", stock: m.stock, min_stock: m.min_stock, value: m.buy_price, total: m.stock * m.buy_price })),
  ];
  const categories = [...new Set(all.map((r) => r.category))].sort();

  const key: SortKey = COLUMNS.find((c) => c.key === sort)?.key ?? "name";
  const down = dir === "desc";
  const rows = all
    .filter((r) => (!cat || r.category === cat) && (!search || r.name.toLowerCase().includes(search)))
    .sort((a, b) => {
      const [x, y] = [a[key] ?? -1, b[key] ?? -1];
      const order = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y)) : x - y;
      return down ? -order : order;
    });

  const link = (change: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, cat, sort, dir, ...change })) if (v) params.set(k, v);
    return `/admin/stock?${params}`;
  };

  return (
    <>
      <PageHeader title="Stock" subtitle={manager ? "What is on the shelf. Sales and purchases update it on their own, corrections go here." : "What is on the shelf."}>
        <div className="flex flex-wrap gap-2">
          <form className="flex gap-2">
            {cat && <input type="hidden" name="cat" value={cat} />}
            <SuggestInput name="q" defaultValue={q} options={all.map((r) => r.name)} className="w-48" placeholder="Search stock" label="Search stock" />
            <button className="btn-ghost !py-2 text-sm" type="submit">Search</button>
          </form>
          {manager && <Link href="/admin/purchases" className="btn-gold !py-2 text-sm">+ Buy stock</Link>}
        </div>
      </PageHeader>
      <Notice error={error} />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Total value" value={`${g(total(all))}g`} />
        <Stat label="Running low" value={g(all.filter(isLow).length)} />
        <Stat label="Below zero" value={g(all.filter((r) => r.stock < 0).length)} tone={all.some((r) => r.stock < 0) ? "bad" : undefined} />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Link href={link({ cat: undefined })} className={`${cat ? "btn-ghost" : "btn-gold"} !py-1 text-sm`}>All</Link>
        {categories.map((c) => (
          <Link key={c} href={link({ cat: c })} className={`${c === cat ? "btn-gold" : "btn-ghost"} !py-1 text-sm`}>{c}</Link>
        ))}
      </div>

      <div className="panel overflow-x-auto mb-8">
        <table className="ledger min-w-[44rem]">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={"number" in c ? "text-right" : undefined} aria-sort={c.key === key ? (down ? "descending" : "ascending") : undefined}>
                  <Link href={link({ sort: c.key, dir: c.key === key && !down ? "desc" : undefined })}>
                    {c.label}{c.key === key ? (down ? " ↓" : " ↑") : ""}
                  </Link>
                </th>
              ))}
              {manager && <th className="w-36" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const form = `stock-${r.id}`;
              const alert = r.stock < 0 ? "text-[#e08a8a]" : isLow(r) ? "text-[#e0bd4a]" : "";
              return (
                <tr key={r.id}>
                  <td className="truncate">{r.name}</td>
                  <td className="muted text-sm">{r.category}</td>
                  <td className={`text-right tabular-nums ${alert}`}>
                    {manager ? (
                      <input key={r.stock} form={form} name="target" inputMode="decimal" defaultValue={g(r.stock)} className={`input !py-1 text-sm text-right ${alert}`} aria-label={`Stock of ${r.name}`} />
                    ) : g(r.stock)}
                  </td>
                  <td className="text-right tabular-nums muted">{g(r.value)}g</td>
                  <td className="text-right tabular-nums">{g(r.total)}g</td>
                  {manager && (
                    <td>
                      <form id={form} action={setStockAction} className="flex justify-end gap-1">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="kind" value={r.kind} />
                        <button className="btn-ghost !py-1 !px-2 text-sm" type="submit">Set</button>
                        <button className="btn-ghost !py-1 !px-2.5 text-sm" type="submit" name="step" value="-1" aria-label={`One less ${r.name}`}>−</button>
                        <button className="btn-ghost !py-1 !px-2.5 text-sm" type="submit" name="step" value="1" aria-label={`One more ${r.name}`}>+</button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="muted text-sm px-4 py-6">{search || cat ? "No item matches." : "No items yet."}</p>}
      </div>
    </>
  );
}
