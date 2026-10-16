import { getBooks } from "@/lib/books";
import { getCatalogue } from "@/lib/catalog";

export interface SellerRow {
  name: string;
  lines: number;
  qty: number;
  revenue: number;
  profit: number;
}

export interface CategoryRow {
  category: string;
  qty: number;
  revenue: number;
  profit: number;
}

export interface ItemRow {
  name: string;
  qty: number;
  revenue: number;
  profit: number;
}

/** Range presets in days (all-time = everything). */
export const RANGE_PRESETS = [
  { key: "today", label: "Today", days: 1 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "all", label: "All time", days: 0 },
] as const;

export async function getReport(days: number): Promise<{
  sellers: SellerRow[];
  categories: CategoryRow[];
  items: ItemRow[];
  totals: { revenue: number; profit: number; lines: number; qty: number };
  salesCount: number;
}> {
  const [b, { items }] = await Promise.all([getBooks(), getCatalogue()]);
  const since = days > 0 ? Date.now() - days * 24 * 3600 * 1000 : 0;
  const rows = b.salesRows.filter((s) => new Date(s.timestamp).getTime() >= since);
  const catOf = new Map(items.map((i) => [i.id, i.category_slug]));
  const sellers = new Map<string, SellerRow>();
  const categories = new Map<string, CategoryRow>();
  const byItem = new Map<string, ItemRow>();
  let revenue = 0;
  let profit = 0;
  let qty = 0;
  for (const s of rows) {
    // Frozen snapshots: revenue honors the per-line discount recorded at sale.
    const lineRevenue = Math.max(0, s.unitSalePrice * s.qty - (s.discount || 0));
    const lineProfit = s.totalProfit;
    revenue += lineRevenue;
    profit += lineProfit;
    qty += s.qty;
    const seller = sellers.get(s.soldByName) || { name: s.soldByName, lines: 0, qty: 0, revenue: 0, profit: 0 };
    seller.lines += 1;
    seller.qty += s.qty;
    seller.revenue += lineRevenue;
    seller.profit += lineProfit;
    sellers.set(s.soldByName, seller);
    const cat = catOf.get(s.itemId) || "other";
    const c = categories.get(cat) || { category: cat, qty: 0, revenue: 0, profit: 0 };
    c.qty += s.qty;
    c.revenue += lineRevenue;
    c.profit += lineProfit;
    categories.set(cat, c);
    const it = byItem.get(s.itemId) || { name: s.itemName, qty: 0, revenue: 0, profit: 0 };
    it.qty += s.qty;
    it.revenue += lineRevenue;
    it.profit += lineProfit;
    byItem.set(s.itemId, it);
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const finish = <T extends { revenue: number; profit: number }>(m: Map<string, T>): T[] =>
    [...m.values()].map((v) => ({ ...v, revenue: r2(v.revenue), profit: r2(v.profit) }));
  return {
    sellers: finish(sellers).sort((a, b) => b.profit - a.profit),
    categories: finish(categories).sort((a, b) => b.revenue - a.revenue),
    items: finish(byItem).sort((a, b) => b.qty - a.qty).slice(0, 15),
    totals: { revenue: r2(revenue), profit: r2(profit), lines: rows.length, qty },
    salesCount: b.salesRows.length,
  };
}
