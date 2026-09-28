import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import type { Category, Item, Order } from "./types";
import { SEED_CATEGORIES, SEED_ITEMS } from "./seed";

// Customer-facing storefront. Google Sheets is the quartermaster:
// stock and prices are edited directly in the Sheet, the site only reads.
// (addOrder remains for a possible future order form; nothing calls it right now.)
//
// Non-coder friendly: headers accept plain words (Price, Stock, Show...),
// categories are matched by NAME (no slugs needed), and row IDs are optional.

// In-memory fallback (dev / pre-Sheets setup). Persists per server instance.
const mem = {
  items: [...SEED_ITEMS] as Item[],
  categories: [...SEED_CATEGORIES] as Category[],
  orders: [] as Order[],
};

const SHEET_ID = () => process.env.SHEET_ID || "";

function serviceAccountConfigured() {
  return Boolean(
    SHEET_ID() &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY
  );
}

export function isSheetsConfigured() {
  return Boolean(SHEET_ID());
}

/** True when customer order requests can actually be saved to the Sheet. */
export function canSaveOrders() {
  return serviceAccountConfigured();
}

// ---------- tolerant header handling ----------

/** "Sale Price" / "sale_price" / "PRICE" -> "saleprice" */
function normHeader(h: string) {
  return h.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

function pick(row: Record<string, string>, ...aliases: string[]): string {
  const normed: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) normed[normHeader(k)] = v;
  for (const a of aliases) {
    const v = normed[a];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

const num = (v: unknown, d = 0) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : d;
};

function yesNo(v: string, defaultVal: boolean): boolean {
  const t = v.trim().toLowerCase();
  if (!t) return defaultVal;
  if (["true", "yes", "y", "1", "x", "✓", "show", "visible", "forsale", "listed", "inshop", "active"].includes(t)) return true;
  if (["false", "no", "n", "0", "hide", "hidden", "soldout", "archived"].includes(t)) return false;
  return defaultVal;
}

function slugify(s: string, fallback: string) {
  const s2 = s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s2 || fallback;
}

// ---------- readers: service account, else public link, else seed ----------

async function getServiceDoc() {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const doc = new GoogleSpreadsheet(SHEET_ID(), auth);
  await doc.loadInfo();
  return doc;
}

async function readViaServiceAccount(titleCandidates: string[]): Promise<Record<string, string>[]> {
  const doc = await getServiceDoc();
  const titles = Object.keys(doc.sheetsByTitle);
  for (const cand of titleCandidates) {
    const hit = titles.find((t) => t.toLowerCase() === cand.toLowerCase());
    if (!hit) continue;
    const sheet = doc.sheetsByTitle[hit];
    const rows = await sheet.getRows();
    const out = rows.map((r) => {
      const o: Record<string, string> = {};
      for (const h of sheet.headerValues) o[h] = String(r.get(h) ?? "");
      return o;
    });
    if (out.length) return out;
  }
  return [];
}

function parseCsv(text: string): Record<string, string>[] {
  // minimal RFC-4180 parse (quotes, commas, newlines)
  const cells: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); cur = ""; cells.push(row); row = []; }
    else if (c === "\r") { /* skip */ }
    else cur += c;
  }
  row.push(cur);
  cells.push(row);
  if (!cells.length) return [];
  const headers = cells[0].map((h) => h.trim());
  return cells.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** Reads a tab from a sheet shared as "Anyone with the link can view". No Google Cloud needed. */
async function readViaPublicLink(titleCandidates: string[]): Promise<Record<string, string>[]> {
  for (const cand of titleCandidates) {
    try {
      const res = await fetch(
        `https://docs.google.com/spreadsheets/d/${SHEET_ID()}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cand)}`,
        { next: { revalidate: 60 } }
      );
      if (!res.ok) continue;
      const text = await res.text();
      if (text.includes("<HTML") || text.includes("<html")) continue;
      const rows = parseCsv(text);
      if (rows.length) return rows;
    } catch {
      continue;
    }
  }
  return [];
}

async function readTab(titleCandidates: string[]): Promise<Record<string, string>[]> {
  if (!SHEET_ID()) return [];
  if (serviceAccountConfigured()) {
    try {
      const rows = await readViaServiceAccount(titleCandidates);
      if (rows.length) return rows;
    } catch { /* fall through to public link */ }
  }
  try {
    return await readViaPublicLink(titleCandidates);
  } catch {
    return [];
  }
}

const CATEGORY_TABS = ["categories", "category", "sections"];
const ITEM_TABS = ["items", "item", "stock", "inventory", "products", "catalog", "catalogue", "goods"];

// ---------- mapped getters ----------

export async function getCategories(): Promise<Category[]> {
  const rows = await readTab(CATEGORY_TABS);
  if (!rows.length) return mem.categories;
  return rows
    .map((r, i) => {
      const name = pick(r, "name", "category", "title", "section") || `Category ${i + 1}`;
      const rawSlug = pick(r, "slug", "id");
      const slug = slugify(rawSlug || name, `cat-${i}`);
      return {
        id: slug,
        name,
        slug,
        icon: pick(r, "icon", "emoji"),
        sort_order: num(pick(r, "sortorder", "order", "sort", "position"), i),
      };
    })
    .filter((c) => c.name);
}

function resolveCategorySlug(raw: string, cats: Category[], index: number): { slug: string; auto?: Category } {
  const t = raw.trim();
  if (!t) return { slug: "other", auto: { id: "other", name: "Other goods", slug: "other", icon: "📦", sort_order: 999 } };
  const n = t.toLowerCase();
  const hit = cats.find((c) => c.slug === slugify(t, "") || c.name.toLowerCase() === n || c.slug === n);
  if (hit) return { slug: hit.slug };
  const slug = slugify(t, `cat-${index}`);
  return { slug, auto: { id: slug, name: t, slug, icon: "📦", sort_order: 900 + index } };
}

export async function getItems(): Promise<Item[]> {
  const [rows, cats] = await Promise.all([readTab(ITEM_TABS), getCategories()]);
  if (!rows.length) return mem.items;
  const autoCats = new Map<string, Category>();
  const items: Item[] = [];
  rows.forEach((r, i) => {
    const name = pick(r, "name", "item", "title", "product");
    if (!name) return;
    const { slug, auto } = resolveCategorySlug(pick(r, "categoryslug", "category", "cat", "section", "type", "group"), [...cats, ...autoCats.values()], i);
    if (auto && !autoCats.has(auto.slug) && !cats.some((c) => c.slug === auto.slug)) autoCats.set(auto.slug, auto);
    items.push({
      id: pick(r, "id", "sku", "code") || slugify(name, `item-${i}`),
      name,
      category_slug: slug,
      description: pick(r, "description", "desc", "details", "notes", "info"),
      sale_price: num(pick(r, "saleprice", "price", "sell", "sellprice", "gold", "priceg")),
      cost_value: num(pick(r, "costvalue", "cost", "buycost", "ourcost", "wholesale")),
      stock: num(pick(r, "stock", "qty", "quantity", "amount", "instock", "count", "onhand")),
      low_threshold: num(pick(r, "lowthreshold", "low", "warnat", "restockat"), 2),
      image_url: pick(r, "imageurl", "image", "picture", "photo", "img", "link"),
      active: yesNo(pick(r, "active", "show", "visible", "display", "forsale", "listed", "inshop"), true),
      created_by_char: "",
      updated_by_char: "",
      updated_at: "",
    });
  });
  // stash auto-created categories so getCategories() callers merging can use them
  (getItems as unknown as { _autoCats?: Category[] })._autoCats = [...autoCats.values()];
  return items.length ? items : mem.items;
}

/** Sections announced before they hold stock (always listed, even when empty). */
export const UPCOMING_SECTIONS: Category[] = [
  { id: "enchantments", name: "Enchantments", slug: "enchantments", icon: "✨", sort_order: 9 },
];

/** Categories = Sheet list + any extra sections found in the Items list (so nothing vanishes). */
export async function getCatalogue() {
  const [cats, items] = await Promise.all([getCategories(), getItems()]);
  const auto = (getItems as unknown as { _autoCats?: Category[] })._autoCats || [];
  const merged = [...cats];
  for (const a of auto) if (!merged.some((c) => c.slug === a.slug)) merged.push(a);
  for (const u of UPCOMING_SECTIONS) if (!merged.some((c) => c.slug === u.slug)) merged.push(u);
  // items whose section isn't listed anywhere yet (e.g. categories tab empty)
  for (const it of items) {
    if (!merged.some((c) => c.slug === it.category_slug)) {
      merged.push({ id: it.category_slug, name: it.category_slug.replace(/-/g, " "), slug: it.category_slug, icon: "📦", sort_order: 950 });
    }
  }
  return { categories: merged.sort((a, b) => a.sort_order - b.sort_order), items };
}

// ---------- the one write: public order form ----------

export class OrderSaveUnavailable extends Error {}

export async function addOrder(o: Omit<Order, "id" | "timestamp" | "status"> & { status?: Order["status"] }) {
  const full: Order = { ...o, id: `or-${Date.now()}`, timestamp: new Date().toISOString(), status: o.status ?? "new" };
  if (!serviceAccountConfigured()) {
    if (!SHEET_ID()) mem.orders.unshift(full); // local dev: pretend it saved
    else throw new OrderSaveUnavailable("Orders tab is read-only without a service account — order via Discord instead.");
    return full;
  }
  const doc = await getServiceDoc();
  const titles = Object.keys(doc.sheetsByTitle);
  const hit = titles.find((t) => ["orders", "order", "requests", "orderrequests"].includes(t.toLowerCase()));
  if (!hit) throw new Error("Missing tab: Orders");
  await doc.sheetsByTitle[hit].addRow({ ...full } as unknown as Record<string, string>);
  return full;
}
