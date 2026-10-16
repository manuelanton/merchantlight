import Link from "next/link";
import { getCatalogue } from "@/lib/catalog";
import { getBooks } from "@/lib/books";
import { isFeatureOn } from "@/lib/features";
import { SHOP } from "@/shop/config";
import SaleForm from "@/components/SaleForm";
import SalesTables from "@/components/SalesTables";

export const dynamic = "force-dynamic";

/** v2 pilot: sale form with per-line discounts. Same tables, same books. */
export default async function V2SalesPage() {
  const [{ categories, items }, books] = await Promise.all([getCatalogue(), getBooks()]);
  const trackStock = await isFeatureOn("stock");
  const live = items.filter((i) => i.active);
  const knownLocations: string[] = [...SHOP.locations];
  for (const s of books.salesRows) {
    if (s.location && !knownLocations.includes(s.location)) knownLocations.push(s.location);
  }
  const row = (s: (typeof books.salesRows)[number]) => ({
    id: s.id,
    timestamp: String(s.timestamp),
    itemName: s.itemName,
    qty: s.qty,
    unitSalePrice: s.unitSalePrice,
    totalProfit: s.totalProfit,
    discount: s.discount || 0,
    deductedStock: s.deductedStock,
    location: s.location,
    soldByName: s.soldByName,
  });
  const pending = books.salesRows.filter((s) => s.status !== "confirmed").map(row);
  const done = books.salesRows.filter((s) => s.status === "confirmed").map(row);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Record a sale <span className="badge">v2 pilot</span></h1>
      <p className="text-sm text-[#8a7c64]">
        Same books, with a per-line discount column. Revenue is price minus discount.{" "}
        <Link href="/admin/sales" className="text-[#c9a227]">Back to v1 →</Link>
      </p>
      <SaleForm
        items={live.map((i) => ({ id: i.id, name: i.name, price: i.sale_price, category: i.category_slug, parent: i.parent_id ?? null, parent_id: i.parent_id ?? null, inherit_parent: i.inherit_parent ?? true }))}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        locations={knownLocations}
        showRoad={trackStock}
        showDiscount
      />

      <SalesTables pending={pending} done={done} />
    </div>
  );
}
