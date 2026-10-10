import { notFound } from "next/navigation";
import { getCatalogue } from "@/lib/catalog";
import { getBooks } from "@/lib/books";
import { isFeatureOn } from "@/lib/features";
import StockForm from "@/components/StockForm";
import StockManager from "@/components/StockManager";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  if (!(await isFeatureOn("stock"))) notFound();
  const [{ categories, items }, books] = await Promise.all([getCatalogue(), getBooks()]);
  const live = items.filter((i) => i.active);
  const itemCategory: Record<string, string> = {};
  for (const i of live) itemCategory[i.name] = i.category_slug;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Add stock</h1>
      <p className="text-sm text-[#8a7c64]">Removing stock happens through sales — use a negative amount here only for corrections.</p>
      <StockForm
        items={live.map((i) => ({ id: i.id, name: i.name, price: i.sale_price, category: i.category_slug, parent: i.parent_id ?? null, parent_id: i.parent_id ?? null, inherit_parent: i.inherit_parent ?? true }))}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      />
      <StockManager
        moves={books.moveRows.map((m) => ({
          id: m.id,
          timestamp: typeof m.timestamp === "string" ? m.timestamp : (m.timestamp as Date).toISOString(),
          itemId: m.itemId,
          itemName: m.itemName,
          delta: m.delta,
          reason: m.reason,
          actorName: m.actorName,
        }))}
        counts={[...books.stockByItem.values()]}
        itemCategory={itemCategory}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      />
    </div>
  );
}
