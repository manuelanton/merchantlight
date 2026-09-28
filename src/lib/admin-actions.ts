"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, isQuartermaster } from "@/auth";
import { getDb } from "@/db";
import { categories, items, ledger, sales, stockMoves } from "@/db/schema";
import { getCatalogItems } from "@/lib/catalog";

async function quartermaster() {
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !isQuartermaster(discordId)) throw new Error("UNAUTHORIZED");
  return { name: session.user.name || "Quartermaster", discordId: discordId! };
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function catalogName(itemId: string) {
  const catalog = await getCatalogItems();
  return catalog.find((i) => i.id === itemId)?.name || "goods";
}

function rowsOf(formData: FormData, key: string): string[] {
  return formData.getAll(key).map(String);
}

/** Record a sale: one row per item (repeated item_id/qty/unit_sale_price fields). */
export async function recordSaleAction(formData: FormData) {
  const qm = await quartermaster();
  const ids = rowsOf(formData, "item_id").filter(Boolean);
  if (!ids.length) throw new Error("No items");
  const qtys = rowsOf(formData, "qty");
  const prices = rowsOf(formData, "unit_sale_price");
  const cost = Number(formData.get("unit_cost") || 0);
  const location = String(formData.get("location") || "Gallow's Rock");
  const notes = String(formData.get("notes") || "");
  const db = await getDb();
  for (let n = 0; n < ids.length; n++) {
    const qty = Math.max(1, Number(qtys[n] || 1));
    const price = Number(prices[n] || 0);
    const itemName = await catalogName(ids[n]);
    await db.insert(sales).values({
      id: uid("sl"),
      itemId: ids[n],
      itemName,
      qty,
      unitSalePrice: price,
      unitCostSnapshot: cost,
      totalProfit: (price - cost) * qty,
      location,
      soldByDiscordId: qm.discordId,
      soldByName: qm.name,
      notes,
    });
    // A sale is also a stock movement out.
    await db.insert(stockMoves).values({
      id: uid("sm"),
      itemId: ids[n],
      itemName,
      delta: -qty,
      reason: `Sale (${location})`,
      actorDiscordId: qm.discordId,
      actorName: qm.name,
    });
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/sales");
}

/** Delete a sale + post a reversing stock move (history is never rewritten). */
export async function deleteSaleAction(formData: FormData) {
  const qm = await quartermaster();
  const id = String(formData.get("id"));
  const db = await getDb();
  const found = await db.select().from(sales).where(eq(sales.id, id)).limit(1);
  const s = found[0];
  if (!s) throw new Error("Sale not found");
  await db.delete(sales).where(eq(sales.id, id));
  await db.insert(stockMoves).values({
    id: uid("sm"),
    itemId: s.itemId,
    itemName: s.itemName,
    delta: s.qty,
    reason: `Void sale by ${s.soldByName}`,
    actorDiscordId: qm.discordId,
    actorName: qm.name,
  });
  revalidatePath("/admin", "layout");
  redirect("/admin/sales");
}

/** Log stock movements: one row per item (repeated item_id/delta fields). */
export async function adjustStockAction(formData: FormData) {
  const qm = await quartermaster();
  const ids = rowsOf(formData, "item_id").filter(Boolean);
  if (!ids.length) throw new Error("No items");
  const deltas = rowsOf(formData, "delta");
  const reason = String(formData.get("reason") || "");
  const db = await getDb();
  for (let n = 0; n < ids.length; n++) {
    const delta = Number(deltas[n] || 0);
    if (!delta) continue;
    await db.insert(stockMoves).values({
      id: uid("sm"),
      itemId: ids[n],
      itemName: await catalogName(ids[n]),
      delta,
      reason: reason || (delta > 0 ? "Restock" : "Correction"),
      actorDiscordId: qm.discordId,
      actorName: qm.name,
    });
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/stock");
}

/** Delete a manual stock move. Sale-linked moves go away via their sale instead. */
export async function deleteMoveAction(formData: FormData) {
  await quartermaster();
  const id = String(formData.get("id"));
  const db = await getDb();
  const found = await db.select().from(stockMoves).where(eq(stockMoves.id, id)).limit(1);
  const m = found[0];
  if (!m) throw new Error("Move not found");
  if (m.reason.startsWith("Sale (")) throw new Error("Sale moves can only be removed by voiding the sale");
  await db.delete(stockMoves).where(eq(stockMoves.id, id));
  revalidatePath("/admin", "layout");
  redirect("/admin/stock");
}

export async function addLedgerAction(formData: FormData) {
  const qm = await quartermaster();
  const type = String(formData.get("type")) as "contribution" | "expense" | "payout" | "sale_income";
  let amount = Number(formData.get("amount_gold") || 0);
  if ((type === "expense" || type === "payout") && amount > 0) amount = -amount;
  if ((type === "contribution" || type === "sale_income") && amount < 0) amount = -amount;
  const db = await getDb();
  await db.insert(ledger).values({
    id: uid("lg"),
    type,
    member: String(formData.get("member") || qm.name),
    amountGold: amount,
    category: String(formData.get("category") || ""),
    description: String(formData.get("description") || ""),
    actorDiscordId: qm.discordId,
  });
  revalidatePath("/admin", "layout");
  redirect("/admin/ledger");
}

export async function updateLedgerAction(formData: FormData) {
  const qm = await quartermaster();
  const id = String(formData.get("id"));
  const type = String(formData.get("type")) as "contribution" | "expense" | "payout" | "sale_income";
  let amount = Number(formData.get("amount_gold") || 0);
  if ((type === "expense" || type === "payout") && amount > 0) amount = -amount;
  if ((type === "contribution" || type === "sale_income") && amount < 0) amount = -amount;
  const db = await getDb();
  await db
    .update(ledger)
    .set({
      type,
      member: String(formData.get("member") || qm.name),
      amountGold: amount,
      category: String(formData.get("category") || ""),
      description: String(formData.get("description") || ""),
    })
    .where(eq(ledger.id, id));
  revalidatePath("/admin", "layout");
  redirect("/admin/ledger");
}

export async function deleteLedgerAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  await db.delete(ledger).where(eq(ledger.id, String(formData.get("id"))));
  revalidatePath("/admin", "layout");
  redirect("/admin/ledger");
}

// ---------- catalogue (DB-managed; the sheet is retired) ----------

function slugify(s: string, fallback: string) {
  const out = s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return out || fallback;
}

export async function createItemAction(formData: FormData) {
  const qm = await quartermaster();
  const name = String(formData.get("name") || "Unnamed").trim();
  const db = await getDb();
  await db.insert(items).values({
    id: `${slugify(name, `item-${Date.now()}`)}`,
    name,
    categorySlug: String(formData.get("category_slug") || "trade-goods"),
    description: String(formData.get("description") || ""),
    salePrice: Number(formData.get("sale_price") || 0),
    costValue: Number(formData.get("cost_value") || 0),
    active: String(formData.get("active") || "true") === "true",
    createdByDiscordId: qm.discordId,
    createdByName: qm.name,
  });
  revalidatePath("/", "layout");
  redirect("/admin/items");
}

export async function updateItemAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  await db
    .update(items)
    .set({
      name: String(formData.get("name") || "Unnamed").trim(),
      categorySlug: String(formData.get("category_slug")),
      description: String(formData.get("description") || ""),
      salePrice: Number(formData.get("sale_price") || 0),
      costValue: Number(formData.get("cost_value") || 0),
      active: String(formData.get("active") || "true") === "true",
      updatedAt: new Date(),
    })
    .where(eq(items.id, String(formData.get("id"))));
  revalidatePath("/", "layout");
  redirect("/admin/items");
}

export async function deleteItemAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  // Safe: sales + stock moves keep item-name snapshots, so history survives.
  await db.delete(items).where(eq(items.id, String(formData.get("id"))));
  revalidatePath("/", "layout");
  redirect("/admin/items");
}

export async function createCategoryAction(formData: FormData) {
  await quartermaster();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Category needs a name");
  const db = await getDb();
  const existing = await db.select().from(categories);
  const maxSort = existing.reduce((a, c) => Math.max(a, c.sortOrder), 0);
  const slug = slugify(name, `cat-${Date.now()}`);
  await db.insert(categories).values({
    id: slug, name, slug,
    icon: String(formData.get("icon") || "📦"),
    sortOrder: maxSort + 1,
  });
  revalidatePath("/", "layout");
  redirect("/admin/items");
}

export async function renameCategoryAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  await db
    .update(categories)
    .set({ name: String(formData.get("name") || "").trim(), icon: String(formData.get("icon") || "") })
    .where(eq(categories.id, String(formData.get("id"))));
  revalidatePath("/", "layout");
  redirect("/admin/items");
}

export async function deleteCategoryAction(formData: FormData) {
  await quartermaster();
  const id = String(formData.get("id"));
  const db = await getDb();
  const used = await db.select({ id: items.id }).from(items).where(eq(items.categorySlug, id));
  if (used.length) throw new Error(`Category still holds ${used.length} item(s) — move or delete them first`);
  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/", "layout");
  redirect("/admin/items");
}
