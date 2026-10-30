import { desc, gte, lte, and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items, ledger, sales } from "@/db/schema";
import { g } from "@/lib/format";

export function getWeekRange(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun, 6 Sat
  // Sat-Fri week: week ends Friday, starts previous Saturday
  // If today is Sat(6), week started today? Or easier: find previous Saturday
  const diffToSat = (day + 1) % 7; // days since Saturday? Sat is 6, want to go back to start of Sat
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(d.getDate() - ((day + 1) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function getWeeklyReport(weekStart?: Date, weekEnd?: Date) {
  const db = await getDb();
  const range = weekStart && weekEnd ? { start: weekStart, end: weekEnd } : getWeekRange();
  const [salesRows, ledgerRows] = await Promise.all([
    db.select().from(sales).where(and(gte(sales.timestamp, range.start), lte(sales.timestamp, range.end))),
    db.select().from(ledger).where(and(gte(ledger.timestamp, range.start), lte(ledger.timestamp, range.end))),
  ]);
  const confirmed = salesRows.filter((s) => s.status === "confirmed");
  const revenue = confirmed.reduce((a, s) => a + s.unitSalePrice * s.qty, 0);
  const profit = confirmed.reduce((a, s) => a + s.totalProfit, 0);
  const expenses = ledgerRows.filter((e) => e.type === "expense").reduce((a, e) => a + Math.abs(e.amountGold), 0);
  const rent = ledgerRows
    .filter((e) => e.type === "expense" && e.category.toLowerCase() === "rent")
    .reduce((a, e) => a + Math.abs(e.amountGold), 0);
  const net = profit - expenses;
  const itemMap = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
  for (const s of confirmed) {
    const cur = itemMap.get(s.itemId) || { name: s.itemName, qty: 0, revenue: 0, profit: 0 };
    cur.qty += s.qty;
    cur.revenue += s.unitSalePrice * s.qty;
    cur.profit += s.totalProfit;
    itemMap.set(s.itemId, cur);
  }
  const topItems = [...itemMap.values()].sort((a, b) => b.profit - a.profit).slice(0, 15);
  const sellerMap = new Map<string, { name: string; count: number; revenue: number; profit: number }>();
  for (const s of confirmed) {
    const key = s.soldByDiscordId || s.soldByName;
    const cur = sellerMap.get(key) || { name: s.soldByName, count: 0, revenue: 0, profit: 0 };
    cur.count += 1;
    cur.revenue += s.unitSalePrice * s.qty;
    cur.profit += s.totalProfit;
    sellerMap.set(key, cur);
  }
  const bySeller = [...sellerMap.values()].sort((a, b) => b.profit - a.profit);
  return { range, confirmedCount: confirmed.length, revenue, profit, expenses, rent, net, topItems, bySeller, allSales: confirmed };
}