import { auth, isQuartermaster } from "@/auth";
import { getDb } from "@/db";
import { sales } from "@/db/schema";
import { recordSaleAction } from "@/lib/admin-actions";
import { getBooks } from "@/lib/books";
import { desc, eq } from "drizzle-orm";
import { isFeatureOn } from "@/lib/features";
import { SHOP } from "@/shop/config";
import { getMemberForDiscord, getMembers } from "@/lib/members";
import { getCatalogue } from "@/lib/catalog";
import { g } from "@/lib/format";
import SaleForm from "@/components/SaleForm";
import SalesTables from "@/components/SalesTables";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  const member = session?.user && discordId ? await getMemberForDiscord(discordId) : null;
  const isEmp = member?.role === "employee" && !isQuartermaster(discordId);
  const [{ categories, items }, trackStock, allMembers] = await Promise.all([
    getCatalogue(),
    isFeatureOn("stock"),
    getMembers(),
  ]);
  const formItems = items.map((i) => ({
    id: i.id,
    name: i.name,
    price: i.sale_price,
    category: i.category_slug,
    parent: i.parent_id ?? null,
    parent_id: i.parent_id ?? null,
    inherit_parent: i.inherit_parent ?? true,
    hidden: !i.active,
  }));
  const formCategories = categories.map((c) => ({ slug: c.slug, name: c.name }));

  if (isEmp && discordId) {
    const db = await getDb();
    const mine = await db
      .select()
      .from(sales)
      .where(eq(sales.soldByDiscordId, discordId))
      .orderBy(desc(sales.timestamp));
    const knownLocations: string[] = [...SHOP.locations];
    for (const s of mine) if (s.location && !knownLocations.includes(s.location)) knownLocations.push(s.location);
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl">Record a sale</h1>
        <p className="text-sm text-[#8a7c64]">Your sales land pending until a quartermaster confirms the deposit.</p>
        <SaleForm
          items={formItems}
          categories={formCategories}
          locations={knownLocations}
          showRoad={trackStock}
        />
        <div className="card p-4 overflow-x-auto">
          <h2 className="font-display text-lg mb-2">My sales</h2>
          <table className="ledger min-w-[640px]">
            <thead><tr><th>When</th><th>Item</th><th>Qty</th><th>Price</th><th>Profit</th><th>Status</th></tr></thead>
            <tbody>
              {mine.map((s) => (
                <tr key={s.id}>
                  <td className="text-xs">{new Date(s.timestamp).toLocaleString()}</td>
                  <td>{s.itemName}</td>
                  <td>{s.qty}</td>
                  <td>{g(s.unitSalePrice)}g</td>
                  <td className="text-[#7fd08a]">{s.status === "confirmed" ? `+${g(s.totalProfit)}g` : "—"}</td>
                  <td className="text-xs">{s.status === "confirmed" ? "✓ deposited" : "pending"}</td>
                </tr>
              ))}
              {!mine.length && <tr><td colSpan={6} className="text-[#8a7c64]">No sales yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const books = await getBooks();
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
  const sellers = allMembers
    .filter((m) => m.discordId && m.active)
    .map((m) => ({ name: m.name, discordId: m.discordId! }));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Record a sale</h1>
      <p className="text-sm text-[#8a7c64]">Sales land pending — gold splits only once someone confirms the deposit.</p>
      <SaleForm
        items={formItems}
        categories={formCategories}
        locations={knownLocations}
        showRoad={trackStock}
        sellers={sellers}
      />

      <SalesTables pending={pending} done={done} />
    </div>
  );
}
