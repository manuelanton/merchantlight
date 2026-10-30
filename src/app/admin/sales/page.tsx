import { auth, isQuartermaster } from "@/auth";
import { getDb } from "@/db";
import { sales, items, categories } from "@/db/schema";
import { recordSaleAction, confirmSaleAction, deleteSaleAction } from "@/lib/admin-actions";
import { getBooks } from "@/lib/books";
import { desc, eq } from "drizzle-orm";
import { isFeatureOn } from "@/lib/features";
import { SHOP } from "@/shop/config";
import { getMemberForDiscord } from "@/lib/members";
import { getCatalogue } from "@/lib/catalog";
import SaleForm from "@/components/SaleForm";
import SalesTables from "@/components/SalesTables";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  const member = session?.user && discordId ? await getMemberForDiscord(discordId) : null;
  const [{ categories, items }, books] = await Promise.all([getCatalogue(), getBooks()]);
  const trackStock = await isFeatureOn("stock");
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
      <h1 className="font-display text-3xl">Record a sale</h1>
      <p className="text-sm text-[#8a7c64]">Sales land pending — gold splits only once someone confirms the deposit.</p>
      <SaleForm
        items={items.map((i) => ({ id: i.id, name: i.name, price: i.sale_price, category: i.category_slug, parent: i.parent_id ?? null, parent_id: i.parent_id ?? null, inherit_parent: i.inherit_parent ?? true, hidden: !i.active }))}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        locations={knownLocations}
        showRoad={trackStock}
      />

      <SalesTables pending={pending} done={done} />
    </div>
  );
}
