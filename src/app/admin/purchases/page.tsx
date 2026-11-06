import ConfirmButton from "@/components/ConfirmButton";
import PurchaseForm from "@/components/PurchaseForm";
import { Empty, Notice, PageHeader, Section } from "@/components/store-ui";
import { g } from "@/lib/format";
import { requireManager } from "@/lib/store-access";
import { deletePurchaseAction } from "@/lib/store-actions";
import { listGoods, listMaterials, listPurchases } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export default async function Purchases({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const access = await requireManager();
  const { error } = await searchParams;
  const [goods, materials, purchases] = await Promise.all([
    listGoods(access.profileId),
    listMaterials(access.profileId),
    listPurchases(access.profileId),
  ]);

  const names = new Set(goods.map((i) => i.name));
  const options = [
    ...goods.filter((i) => !i.is_bundle).map((i) => ({ kind: "good" as const, id: i.id, label: i.name, cost: i.buy_price ?? 0, stock: i.stock })),
    ...materials.map((m) => ({ kind: "material" as const, id: m.id, label: names.has(m.name) ? `${m.name} (material)` : m.name, cost: m.buy_price, stock: m.stock })),
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader title="Purchases" subtitle="Buying stock: it goes on the shelf and the gold leaves the treasury." />
      <Notice error={error} />

      <Section title="New purchase">
        {options.length ? <PurchaseForm options={options} /> : <div className="panel"><Empty>There are no items yet. Add them on the Items page first.</Empty></div>}
      </Section>

      <Section title="Purchase history">
        <div className="panel divide-y divide-[#1c2b31]">
          {!purchases.length && <Empty>No purchases yet.</Empty>}
          {purchases.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="tabular-nums">#{p.purchase_no}</span>
                <span className="text-sm"> {p.summary}</span>
                <span className="muted text-xs block truncate">
                  {new Date(p.purchase_date).toISOString().slice(0, 10)}{p.supplier ? ` · ${p.supplier}` : ""}{p.buyer ? ` · ${p.buyer}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-3 shrink-0">
                <span className="tabular-nums">{g(p.total)}g</span>
                <form action={deletePurchaseAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmButton className="btn-ghost !py-1 !px-2 text-sm" message={`Delete purchase #${p.purchase_no}? Stock and treasury are reversed.`}>×</ConfirmButton>
                </form>
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
