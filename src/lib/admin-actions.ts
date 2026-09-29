"use server";
import { eq, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, isQuartermaster } from "@/auth";
import { getDb } from "@/db";
import { categories, itemIngredients, items, ledger, notes, sales, stockMoves } from "@/db/schema";
import { getCatalogItems } from "@/lib/catalog";
import { g, splitEvenly } from "@/lib/format";
import { effectiveCost } from "@/lib/cost";
import { setShopOpen } from "@/lib/shop";

async function quartermaster() {
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !isQuartermaster(discordId)) throw new Error("UNAUTHORIZED");
  return { name: session.user.name || "Quartermaster", discordId: discordId! };
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

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
  const seller = String(formData.get("seller") || qm.name).trim() || qm.name;
  const db = await getDb();
  // Roster for splitting: members with nonzero net (same rule as rent).
  const existing = await db.select().from(ledger);
  const nets = new Map<string, number>();
  for (const e of existing) nets.set(e.member, (nets.get(e.member) || 0) + e.amountGold);
  const roster = [...nets.entries()].filter(([, v]) => v !== 0).map(([m]) => m).sort();
  const catalog = await getCatalogItems();
  const dbIngredients = await db.select().from(itemIngredients);
  const effCost = (itemId: string, fallback: number) => {
    const lines = dbIngredients.filter((r) => r.itemId === itemId);
    if (!lines.length) return fallback;
    return effectiveCost(
      itemId,
      catalog.map((m) => ({ id: m.id, cost_value: m.cost_value })),
      dbIngredients.map((r) => ({ itemId: r.itemId, materialItemId: r.materialItemId, qty: r.qty }))
    );
  };
  for (let n = 0; n < ids.length; n++) {
    const qty = Math.max(1, Number(qtys[n] || 1));
    const price = Number(prices[n] || 0);
    const item = catalog.find((i) => i.id === ids[n]);
    const itemName = item?.name || "goods";
    // Cost basis: live recipe cost wins; catalogue cost next; manual entry fills gaps.
    const baseCost = item && item.cost_value > 0 ? item.cost_value : cost;
    const itemCost = effCost(ids[n], baseCost);
    const saleId = uid("sl");
    await db.insert(sales).values({
      id: saleId,
      itemId: ids[n],
      itemName,
      qty,
      unitSalePrice: price,
      unitCostSnapshot: itemCost,
      totalProfit: (price - itemCost) * qty,
      location,
      soldByDiscordId: qm.discordId,
      soldByName: seller,
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
      actorName: seller,
    });
    // Only PROFIT splits. Intake credits already recognize the contributor's
    // capital — splitting revenue on top would pay that capital out twice.
    const profit = Math.round((price - itemCost) * qty * 100) / 100;
    if (profit !== 0) {
      const who = roster.length ? roster : [seller];
      const shares = splitEvenly(profit, who.length);
      for (let i = 0; i < who.length; i++) {
        await db.insert(ledger).values({
          id: uid("lg"),
          type: "sale_income",
          member: who[i],
          amountGold: shares[i],
          category: "sales",
          description: `Sale profit split [sale:${saleId}]: ${itemName} × ${qty} at ${location} (${g(price)}g − ${g(itemCost)}g cost)${notes ? ` — ${notes}` : ""} (share ${i + 1} of ${who.length})`,
          actorDiscordId: qm.discordId,
        });
      }
    }
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/sales");
}

/** Delete a sale + reverse its postings (stock back, split shares removed). */
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
  // Remove the auto-posted split shares for this exact sale (never earned).
  const shares = await db.select().from(ledger).where(like(ledger.description, `%[sale:${id}]%`));
  for (const row of shares) {
    await db.delete(ledger).where(eq(ledger.id, row.id));
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/sales");
}

/** Log stock movements: one row per item (repeated item_id/delta fields).
 *  Stock goes to the shared pot — no individual credit. Sale profits split evenly. */
export async function adjustStockAction(formData: FormData) {
  const qm = await quartermaster();
  const ids = rowsOf(formData, "item_id").filter(Boolean);
  if (!ids.length) throw new Error("No items");
  const deltas = rowsOf(formData, "delta");
  const db = await getDb();
  const catalog = await getCatalogItems();
  for (let n = 0; n < ids.length; n++) {
    const delta = Number(deltas[n] || 0);
    if (!delta) continue;
    const item = catalog.find((i) => i.id === ids[n]);
    const itemName = item?.name || "goods";
    await db.insert(stockMoves).values({
      id: uid("sm"),
      itemId: ids[n],
      itemName,
      delta,
      reason: "Restock",
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
  const category = String(formData.get("category") || "");
  const description = String(formData.get("description") || "");
  const member = String(formData.get("member") || qm.name);
  const db = await getDb();
  // Rent is always shared: an expense categorized as rent fans out into
  // equal per-member shares instead of one lump row.
  if (type === "expense" && category.trim().toLowerCase() === "rent") {
    const existing = await db.select().from(ledger);
    const nets = new Map<string, number>();
    for (const e of existing) nets.set(e.member, (nets.get(e.member) || 0) + e.amountGold);
    const roster = [...nets.entries()].filter(([, v]) => v !== 0).map(([m]) => m).sort();
    if (roster.length) {
      const total = Math.abs(amount);
      const shares = splitEvenly(total, roster.length);
      for (let i = 0; i < roster.length; i++) {
        await db.insert(ledger).values({
          id: uid("lg"),
          type: "expense",
          member: roster[i],
          amountGold: -shares[i],
          category: "rent",
          description: `Rent split${description ? ` (${description})` : ""}: share ${i + 1} of ${roster.length} of ${g(total)}g`,
          actorDiscordId: qm.discordId,
        });
      }
      revalidatePath("/admin", "layout");
      redirect("/admin/ledger");
    }
    // No roster yet (first entry ever): store the single row as-is.
  }
  await db.insert(ledger).values({
    id: uid("lg"),
    type,
    member,
    amountGold: amount,
    category,
    description,
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
  const itemId = `${slugify(name, `item-${Date.now()}`)}`;
  await db.insert(items).values({
    id: itemId,
    name,
    categorySlug: String(formData.get("category_slug") || "trade-goods"),
    description: String(formData.get("description") || ""),
    salePrice: Number(formData.get("sale_price") || 0),
    costValue: Number(formData.get("cost_value") || 0),
    active: String(formData.get("active") || "true") === "true",
    createdByDiscordId: qm.discordId,
    createdByName: qm.name,
  });
  // Optional recipe supplied inline with the new item.
  const materialIds = formData.getAll("material_item_id").map(String).filter(Boolean);
  const qtys = formData.getAll("qty").map(String);
  if (materialIds.length) {
    const catalog = await getCatalogItems();
    for (let n = 0; n < materialIds.length; n++) {
      const qty = Number(qtys[n] || 1);
      if (!(qty > 0)) continue;
      const mat = catalog.find((m) => m.id === materialIds[n]);
      await db.insert(itemIngredients).values({
        id: uid("ig"),
        itemId,
        materialItemId: materialIds[n],
        materialName: mat?.name || "material",
        qty,
        actorDiscordId: qm.discordId,
      });
    }
  }
  revalidatePath("/", "layout");
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
}

export async function deleteItemAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  // Safe: sales + stock moves keep item-name snapshots, so history survives.
  await db.delete(items).where(eq(items.id, String(formData.get("id"))));
  revalidatePath("/", "layout");
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
}

export async function renameCategoryAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  await db
    .update(categories)
    .set({ name: String(formData.get("name") || "").trim(), icon: String(formData.get("icon") || "") })
    .where(eq(categories.id, String(formData.get("id"))));
  revalidatePath("/", "layout");
}

export async function deleteCategoryAction(formData: FormData) {
  await quartermaster();
  const id = String(formData.get("id"));
  const db = await getDb();
  const used = await db.select({ id: items.id }).from(items).where(eq(items.categorySlug, id));
  if (used.length) throw new Error(`Category still holds ${used.length} item(s) — move or delete them first`);
  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/", "layout");
}

// ---------- noticeboard ----------

export async function postNoteAction(formData: FormData) {  const qm = await quartermaster();
  const title = String(formData.get("title") || '').trim();
  if (!title) throw new Error('A note needs a title');
  const kind = String(formData.get("kind") || 'news');
  const db = await getDb();
  await db.insert(notes).values({
    id: uid("nt"),
    kind: ['news', 'request', 'todo', 'stock'].includes(kind) ? kind : 'news',
    title,
    body: String(formData.get("body") || ''),
    authorDiscordId: qm.discordId,
    authorName: qm.name,
  });
  revalidatePath('/admin', 'layout');
  redirect('/admin/notes');
}

export async function resolveNoteAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  const done = String(formData.get('resolved') || 'false') === 'true';
  await db.update(notes).set({ resolved: !done }).where(eq(notes.id, String(formData.get('id'))));
  revalidatePath('/admin', 'layout');
  redirect('/admin/notes');
}

export async function deleteNoteAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  await db.delete(notes).where(eq(notes.id, String(formData.get('id'))));
  revalidatePath('/admin', 'layout');
  redirect('/admin/notes');
}

/** One-click stock request from the dashboard (posts a stock-kind note). */
export async function requestRestockAction(formData: FormData) {
  const qm = await quartermaster();
  const db = await getDb();
  await db.insert(notes).values({
    id: uid("nt"),
    kind: "stock",
    title: String(formData.get("title") || "Restock request"),
    body: String(formData.get("body") || ""),
    authorDiscordId: qm.discordId,
    authorName: qm.name,
  });
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

/** Shop open/closed toggle (salesperson on duty). Shows publicly in the hero. */
export async function setShopOpenAction(formData: FormData) {
  await quartermaster();
  await setShopOpen(String(formData.get('open')) === '1');
  revalidatePath('/', 'layout');
  revalidatePath('/admin', 'layout');
  redirect('/admin');
}

/** Recipe lines for cost math. Accepts repeated material_item_id/qty rows. No
 *  redirect — revalidation alone updates the list without a hard reload. */
export async function addIngredientAction(formData: FormData) {
  const qm = await quartermaster();
  const materialIds = formData.getAll("material_item_id").map(String).filter(Boolean);
  const qtys = formData.getAll("qty").map(String);
  if (!materialIds.length) throw new Error("No ingredients");
  const itemId = String(formData.get("item_id"));
  const catalog = await getCatalogItems();
  const db = await getDb();
  for (let n = 0; n < materialIds.length; n++) {
    const qty = Number(qtys[n] || 1);
    if (!(qty > 0)) continue;
    const mat = catalog.find((i) => i.id === materialIds[n]);
    await db.insert(itemIngredients).values({
      id: uid("ig"),
      itemId,
      materialItemId: materialIds[n],
      materialName: mat?.name || "material",
      qty,
      actorDiscordId: qm.discordId,
    });
  }
  revalidatePath("/admin", "layout");
}

export async function deleteIngredientAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  await db.delete(itemIngredients).where(eq(itemIngredients.id, String(formData.get("id"))));
  revalidatePath("/admin", "layout");
}
