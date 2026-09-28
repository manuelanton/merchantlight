import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import type { Category, Item, LedgerEntry, Order, Sale } from "./types";
import { SEED_CATEGORIES, SEED_ITEMS, SEED_LEDGER, SEED_ORDERS, SEED_SALES } from "./seed";

// In-memory fallback (dev / pre-Sheets setup). Persists per server instance.
const mem = {
  items: [...SEED_ITEMS] as Item[],
  categories: [...SEED_CATEGORIES] as Category[],
  sales: [...SEED_SALES] as Sale[],
  ledger: [...SEED_LEDGER] as LedgerEntry[],
  orders: [...SEED_ORDERS] as Order[],
};

function sheetsConfigured() {
  return Boolean(
    process.env.SHEET_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY
  );
}

export function isSheetsConfigured() {
  return sheetsConfigured();
}

async function getDoc() {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const doc = new GoogleSpreadsheet(process.env.SHEET_ID!, auth);
  await doc.loadInfo();
  return doc;
}

async function readSheet<T>(title: string): Promise<Record<string, string>[]> {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[title];
  if (!sheet) return [];
  const rows = await sheet.getRows();
  return rows.map((r) => {
    const o: Record<string, string> = {};
    for (const h of sheet.headerValues) o[h] = String(r.get(h) ?? "");
    return o;
  });
}

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const bool = (v: unknown) =>
  v === true || v === "TRUE" || v === "true" || v === "1";

export async function getCategories(): Promise<Category[]> {
  if (!sheetsConfigured()) return mem.categories;
  try {
    const rows = await readSheet("Categories");
    if (!rows.length) return mem.categories;
    return rows.map((r, i) => ({
      id: r.id || `c${i}`,
      name: r.name || "Unnamed",
      slug: r.slug || (r.name || `cat-${i}`).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      icon: r.icon || "",
      sort_order: num(r.sort_order, i),
    }));
  } catch {
    return mem.categories;
  }
}

export async function getItems(): Promise<Item[]> {
  if (!sheetsConfigured()) return mem.items;
  try {
    const rows = await readSheet("Items");
    if (!rows.length) return mem.items;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category_slug: r.category_slug,
      description: r.description || "",
      sale_price: num(r.sale_price),
      cost_value: num(r.cost_value),
      stock: num(r.stock),
      low_threshold: num(r.low_threshold, 2),
      image_url: r.image_url || "",
      active: r.active === "" ? true : bool(r.active),
      created_by_char: r.created_by_char || "",
      updated_by_char: r.updated_by_char || "",
      updated_at: r.updated_at || "",
    }));
  } catch {
    return mem.items;
  }
}

export async function getSales(): Promise<Sale[]> {
  if (!sheetsConfigured()) return mem.sales;
  try {
    const rows = await readSheet("Sales");
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      item_id: r.item_id,
      qty: num(r.qty),
      unit_sale_price: num(r.unit_sale_price),
      unit_cost_snapshot: num(r.unit_cost_snapshot),
      total_profit: num(r.total_profit),
      location: r.location || "Windhelm",
      sold_by_char: r.sold_by_char || "",
      notes: r.notes || "",
    }));
  } catch {
    return mem.sales;
  }
}

export async function getLedger(): Promise<LedgerEntry[]> {
  if (!sheetsConfigured()) return mem.ledger;
  try {
    const rows = await readSheet("Ledger");
    if (!rows.length) return mem.ledger;
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      type: (["contribution", "expense", "payout", "sale_income"].includes(r.type) ? r.type : "expense") as LedgerEntry["type"],
      member_char: r.member_char || "",
      amount_gold: num(r.amount_gold),
      category: r.category || "",
      description: r.description || "",
    }));
  } catch {
    return mem.ledger;
  }
}

export async function getOrders(): Promise<Order[]> {
  if (!sheetsConfigured()) return mem.orders;
  try {
    const rows = await readSheet("Orders");
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      customer_char: r.customer_char,
      discord_handle: r.discord_handle || "",
      item_id: r.item_id,
      qty: num(r.qty, 1),
      status: (["new", "accepted", "fulfilled", "cancelled"].includes(r.status) ? r.status : "new") as Order["status"],
      pickup_location: r.pickup_location || "Windhelm",
      notes: r.notes || "",
    }));
  } catch {
    return mem.orders;
  }
}

// ---- writes: Sheets if configured, else memory ----

async function appendRow(title: string, values: Record<string, string | number>) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[title];
  if (!sheet) throw new Error(`Missing tab: ${title}`);
  await sheet.addRow(values as Record<string, string>);
}

async function updateItemRow(id: string, patch: Partial<Item>) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle["Items"];
  const rows = await sheet.getRows();
  const row = rows.find((r) => String(r.get("id")) === id);
  if (!row) throw new Error("Item not found in Sheet");
  for (const [k, v] of Object.entries(patch)) row.set(k, String(v as string | number));
  await row.save();
}

export async function upsertItem(item: Item, actorChar: string) {
  const stamped: Item = { ...item, updated_by_char: actorChar, updated_at: new Date().toISOString() };
  if (!sheetsConfigured()) {
    const i = mem.items.findIndex((x) => x.id === item.id);
    if (i >= 0) mem.items[i] = stamped;
    else mem.items.push({ ...stamped, created_by_char: stamped.created_by_char || actorChar });
    return stamped;
  }
  try {
    await updateItemRow(item.id, stamped);
  } catch {
    await appendRow("Items", {
      id: stamped.id, name: stamped.name, category_slug: stamped.category_slug,
      description: stamped.description, sale_price: stamped.sale_price, cost_value: stamped.cost_value,
      stock: stamped.stock, low_threshold: stamped.low_threshold, image_url: stamped.image_url,
      active: stamped.active ? "TRUE" : "FALSE",
      created_by_char: stamped.created_by_char || actorChar,
      updated_by_char: actorChar, updated_at: stamped.updated_at,
    });
  }
  return stamped;
}

export async function adjustStock(itemId: string, delta: number, actorChar: string) {
  const items = await getItems();
  const it = items.find((x) => x.id === itemId);
  if (!it) throw new Error("Item not found");
  return upsertItem({ ...it, stock: Math.max(0, it.stock + delta) }, actorChar);
}

export async function recordSale(s: Omit<Sale, "id" | "timestamp" | "total_profit"> & { total_profit?: number }) {
  const items = await getItems();
  const it = items.find((x) => x.id === s.item_id);
  const unitCost = it?.cost_value ?? s.unit_cost_snapshot ?? 0;
  const profit = (s.unit_sale_price - unitCost) * s.qty;
  const full: Sale = {
    ...s, unit_cost_snapshot: unitCost, total_profit: profit,
    id: `sl-${Date.now()}`, timestamp: new Date().toISOString(),
  };
  if (!sheetsConfigured()) {
    mem.sales.unshift(full);
    if (it) await adjustStock(it.id, -s.qty, s.sold_by_char);
    return full;
  }
  await appendRow("Sales", { ...full });
  if (it) await adjustStock(it.id, -s.qty, s.sold_by_char);
  return full;
}

export async function addLedger(e: Omit<LedgerEntry, "id" | "timestamp">) {
  const full: LedgerEntry = { ...e, id: `lg-${Date.now()}`, timestamp: new Date().toISOString() };
  if (!sheetsConfigured()) {
    mem.ledger.unshift(full);
    return full;
  }
  await appendRow("Ledger", { ...full });
  return full;
}

export async function addOrder(o: Omit<Order, "id" | "timestamp" | "status"> & { status?: Order["status"] }) {
  const full: Order = { ...o, id: `or-${Date.now()}`, timestamp: new Date().toISOString(), status: o.status ?? "new" };
  if (!sheetsConfigured()) {
    mem.orders.unshift(full);
    return full;
  }
  await appendRow("Orders", { ...full });
  return full;
}

export async function setOrderStatus(id: string, status: Order["status"]) {
  if (!sheetsConfigured()) {
    const o = mem.orders.find((x) => x.id === id);
    if (o) o.status = status;
    return o;
  }
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle["Orders"];
  const rows = await sheet.getRows();
  const row = rows.find((r) => String(r.get("id")) === id);
  if (!row) throw new Error("Order not found");
  row.set("status", status);
  await row.save();
}
