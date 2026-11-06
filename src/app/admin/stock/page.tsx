import Link from "next/link";
import { Notice, PageHeader, Section, Stat } from "@/components/store-ui";
import { g } from "@/lib/format";
import { isManager, requireStaff } from "@/lib/store-access";
import { setStockAction } from "@/lib/store-actions";
import { isLow, listGoods, listMaterials } from "@/lib/store-data";

export const dynamic = "force-dynamic";

interface Row {
  kind: "good" | "material";
  id: string;
  name: string;
  stock: number;
  min_stock: number;
  value: number;
}

const total = (rows: Row[]) => rows.reduce((sum, r) => sum + r.stock * r.value, 0);

function StockTable({ rows, manager }: { rows: Row[]; manager: boolean }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="ledger min-w-[34rem] table-fixed">
        <thead>
          <tr>
            <th>Item</th>
            <th className="text-right w-24">In stock</th>
            <th className="text-right w-20">Value</th>
            <th className="text-right w-20">Total</th>
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
                <td className={`text-right tabular-nums ${alert}`}>
                  {manager ? (
                    <input key={r.stock} form={form} name="target" inputMode="decimal" defaultValue={g(r.stock)} className={`input !py-1 text-sm text-right ${alert}`} aria-label={`Stock of ${r.name}`} />
                  ) : g(r.stock)}
                </td>
                <td className="text-right tabular-nums muted">{g(r.value)}g</td>
                <td className="text-right tabular-nums">{g(r.stock * r.value)}g</td>
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
    </div>
  );
}

export default async function Stock({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await requireStaff();
  const manager = isManager(access);
  const { error } = await searchParams;
  const [goods, materials] = await Promise.all([listGoods(access.profileId), listMaterials(access.profileId)]);

  const groups = new Map<string, Row[]>();
  for (const i of goods) {
    // Bundles have no shelf of their own: selling one takes its parts.
    if (i.is_bundle) continue;
    const row: Row = { kind: "good", id: i.id, name: i.name, stock: i.stock, min_stock: i.min_stock, value: i.sell_price };
    groups.set(i.category, [...(groups.get(i.category) ?? []), row]);
  }
  if (materials.length) {
    groups.set("Raw materials", materials.map((m) => ({ kind: "material", id: m.id, name: m.name, stock: m.stock, min_stock: m.min_stock, value: m.buy_price })));
  }
  const all = [...groups.values()].flat();

  return (
    <>
      <PageHeader title="Stock" subtitle={manager ? "What is on the shelf. Sales and purchases update it on their own, corrections go here." : "What is on the shelf."}>
        {manager && <Link href="/admin/purchases" className="btn-gold !py-2 text-sm">+ Buy stock</Link>}
      </PageHeader>
      <Notice error={error} />

      <div className="grid grid-cols-3 gap-3 mb-8">
        <Stat label="Total value" value={`${g(total(all))}g`} />
        <Stat label="Running low" value={g(all.filter(isLow).length)} />
        <Stat label="Below zero" value={g(all.filter((r) => r.stock < 0).length)} tone={all.some((r) => r.stock < 0) ? "bad" : undefined} />
      </div>

      {!all.length && <p className="muted text-sm">No items yet.</p>}
      {[...groups.entries()].map(([category, rows]) => (
        <Section key={category} title={category} aside={`${g(total(rows))}g`}>
          <StockTable rows={rows} manager={manager} />
        </Section>
      ))}
    </>
  );
}
