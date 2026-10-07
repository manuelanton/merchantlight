"use server";
import { eq, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth, isQuartermaster } from "@/auth";
import { getDb } from "@/db";
import { categories, cashMoves, cashPots, itemIngredients, items, ledger, members, notes, sales, settings, stockMoves, storageUnits } from "@/db/schema";
import { getCatalogItems } from "@/lib/catalog";
import { getRoster } from "@/lib/members";
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

/** Record a sale: one row per item (repeated item_id/qty/unit_sale_price fields).
 *  Sales land PENDING (gold still with the salesperson): stock moves at once,
 *  profit shares post only on confirm. No redirect — list refreshes in place. */
export async function recordSaleAction(formData: FormData) {
  const qm = await quartermaster();
  const ids = rowsOf(formData, "item_id").filter(Boolean);
  if (!ids.length) throw new Error("No items");
  const qtys = rowsOf(formData, "qty");
  const prices = rowsOf(formData, "unit_sale_price");
  const location = String(formData.get("location") || "Darkwater Crossing");
  const notes = String(formData.get("notes") || "");
  const seller = String(formData.get("seller") || qm.name).trim() || qm.name;
  const db = await getDb();
  const catalog = await getCatalogItems();
  const dbIngredients = await db.select().from(itemIngredients);
  const effCost = (itemId: string, fallback: number) => {
    const lines = dbIngredients.filter((r) => r.itemId === itemId);
    if (!lines.length) return fallback;
    return effectiveCost(
      itemId,
      catalog.map((m) => ({ id: m.id, cost_value: m.cost_value, sale_price: m.sale_price })),
      dbIngredients.map((r) => ({ itemId: r.itemId, materialItemId: r.materialItemId, qty: r.qty }))
    );
  };
  for (let n = 0; n < ids.length; n++) {
    const qty = Math.max(1, Number(qtys[n] || 1));
    const price = Number(prices[n] || 0);
    const item = catalog.find((i) => i.id === ids[n]);
    const itemName = item?.name || "goods";
    // Cost basis: live recipe cost wins; then manual cost; then the submitted
    // value; unknown costs default to the sale price (zero assumed profit).
    const submitted = Number(formData.get("unit_cost") || 0);
    const baseCost = item && item.cost_value > 0 ? item.cost_value : submitted > 0 ? submitted : price;
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
      status: "pending",
    });
    // A sale is also a stock movement out (goods are gone either way).
    await db.insert(stockMoves).values({
      id: uid("sm"),
      itemId: ids[n],
      itemName,
      delta: -qty,
      reason: `Sale (${location})`,
      actorDiscordId: qm.discordId,
      actorName: seller,
    });
  }
  revalidatePath("/admin", "layout");
}

/** Confirm a deposited sale: posts the profit split across the roster. */
export async function confirmSaleAction(formData: FormData) {
  const qm = await quartermaster();
  const id = String(formData.get("id"));
  const db = await getDb();
  const found = await db.select().from(sales).where(eq(sales.id, id)).limit(1);
  const s = found[0];
  if (!s) throw new Error("Sale not found");
  if (s.status === "confirmed") throw new Error("Already confirmed");
  const roster = await getRoster();
  const profit = Math.round((s.unitSalePrice - s.unitCostSnapshot) * s.qty * 100) / 100;
  if (profit !== 0) {
    const who = roster.length ? roster : [s.soldByName];
    const shares = splitEvenly(profit, who.length);
    for (let i = 0; i < who.length; i++) {
      await db.insert(ledger).values({
        id: uid("lg"),
        type: "sale_income",
        member: who[i],
        amountGold: shares[i],
        category: "sales",
        description: `Sale profit split [sale:${s.id}]: ${s.itemName} × ${s.qty} at ${s.location} (${g(s.unitSalePrice)}g − ${g(s.unitCostSnapshot)}g cost)${s.notes ? ` — ${s.notes}` : ""} (share ${i + 1} of ${who.length})`,
        actorDiscordId: qm.discordId,
      });
    }
  }
  await db.update(sales).set({ status: "confirmed", confirmedBy: qm.name, confirmedAt: new Date() }).where(eq(sales.id, id));
  // Cash lands in the register lockbox (physical gold ≠ profit shares).
  const revenue = Math.round(s.unitSalePrice * s.qty * 100) / 100;
  if (revenue !== 0) {
    await db.insert(cashMoves).values({
      id: uid("cm"),
      pot: "Lockbox",
      delta: revenue,
      reason: `Sale ${s.itemName} × ${s.qty} at ${s.location}`,
      actorDiscordId: qm.discordId,
      actorName: qm.name,
    });
  }
  revalidatePath("/admin", "layout");
}

/** Confirm every pending sale at once (end-of-shift): posts all profit splits + lockbox cash. */
export async function confirmAllSalesAction() {
  const qm = await quartermaster();
  const db = await getDb();
  const pending = await db.select().from(sales).where(eq(sales.status, "pending"));
  const existing = await db.select().from(ledger);
  const nets = new Map<string, number>();
  for (const e of existing) nets.set(e.member, (nets.get(e.member) || 0) + e.amountGold);
  const roster = [...nets.keys()].sort();
  for (const s of pending) {
    const profit = Math.round((s.unitSalePrice - s.unitCostSnapshot) * s.qty * 100) / 100;
    if (profit !== 0) {
      const who = roster.length ? roster : [s.soldByName];
      const shares = splitEvenly(profit, who.length);
      for (let i = 0; i < who.length; i++) {
        await db.insert(ledger).values({
          id: uid("lg"),
          type: "sale_income",
          member: who[i],
          amountGold: shares[i],
          category: "sales",
          description: `Sale profit split [sale:${s.id}]: ${s.itemName} × ${s.qty} at ${s.location} (${g(s.unitSalePrice)}g − ${g(s.unitCostSnapshot)}g cost)${s.notes ? ` — ${s.notes}` : ""} (share ${i + 1} of ${who.length})`,
          actorDiscordId: qm.discordId,
        });
      }
    }
    const revenue = Math.round(s.unitSalePrice * s.qty * 100) / 100;
    if (revenue !== 0) {
      await db.insert(cashMoves).values({
        id: uid("cm"),
        pot: "Lockbox",
        delta: revenue,
        reason: `Sale ${s.itemName} × ${s.qty} at ${s.location}`,
        actorDiscordId: qm.discordId,
        actorName: qm.name,
      });
    }
    await db.update(sales).set({ status: "confirmed", confirmedBy: qm.name, confirmedAt: new Date() }).where(eq(sales.id, s.id));
  }
  revalidatePath("/admin", "layout");
}
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
  // If the sale was confirmed, its cash already landed in the lockbox — take it back out.
  if (s.status === "confirmed") {
    const revenue = Math.round(s.unitSalePrice * s.qty * 100) / 100;
    if (revenue !== 0) {
      await db.insert(cashMoves).values({
        id: uid("cm"),
        pot: "Lockbox",
        delta: -revenue,
        reason: `Void confirmed sale ${s.itemName} × ${s.qty}`,
        actorDiscordId: qm.discordId,
        actorName: qm.name,
      });
    }
  }
  revalidatePath("/admin", "layout");

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
}

export async function addLedgerAction(formData: FormData) {
  const qm = await quartermaster();
  const type = String(formData.get("type")) as "contribution" | "expense" | "payout" | "sale_income";
  let amount = Number(formData.get("amount_gold") || 0);
  if (!amount) throw new Error("Amount must not be zero — every entry moves gold");
  if ((type === "expense" || type === "payout") && amount > 0) amount = -amount;
  if ((type === "contribution" || type === "sale_income") && amount < 0) amount = -amount;
  const category = String(formData.get("category") || "");
  const description = String(formData.get("description") || "");
  // Company coffers: unattributed company money (e.g. storage income pool).
  // A coffers expense charges nobody — it just leaves the pot.
  const fromCoffers = String(formData.get("from_coffers") || "") === "1";
  const member = fromCoffers ? "" : String(formData.get("member") || qm.name);
  const db = await getDb();
  // Contributions may carry item rows (valued in the form): append the summary
  // and add the goods to stock automatically.
  const contribIds = formData.getAll("contrib_item_id").map(String).filter(Boolean);
  const contribQtys = formData.getAll("contrib_qty").map(String);
  let fullDescription = description;
  if (type === "contribution" && contribIds.length) {
    const catalog = await getCatalogItems();
    const summary = String(formData.get("description_auto") || "").trim();
    if (summary) fullDescription = description ? `${description} (${summary})` : summary;
    for (let n = 0; n < contribIds.length; n++) {
      const qty = Number(contribQtys[n] || 0);
      if (!(qty > 0)) continue;
      const itemName = catalog.find((i) => i.id === contribIds[n])?.name || "goods";
      await db.insert(stockMoves).values({
        id: uid("sm"),
        itemId: contribIds[n],
        itemName,
        delta: Math.round(qty),
        reason: `Contribution by ${member}`,
        actorDiscordId: qm.discordId,
        actorName: qm.name,
      });
    }
  }
  // Rent is always shared: an expense categorized as rent fans out into
  // equal per-member shares instead of one lump row — unless it comes
  // straight from company coffers, which charges nobody.
  if (type === "expense" && !fromCoffers && category.trim().toLowerCase() === "rent") {
    const roster = await getRoster();
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
      return;
    }
    // No roster yet (first entry ever): store the single row as-is.
  }
  await db.insert(ledger).values({
    id: uid("lg"),
    type,
    member,
    amountGold: amount,
    category,
    description: fullDescription,
    actorDiscordId: qm.discordId,
  });
  revalidatePath("/admin", "layout");

}

export async function updateLedgerAction(formData: FormData) {
  const qm = await quartermaster();
  const id = String(formData.get("id"));
  const type = String(formData.get("type")) as "contribution" | "expense" | "payout" | "sale_income";
  let amount = Number(formData.get("amount_gold") || 0);
  if (!amount) throw new Error("Amount must not be zero — every entry moves gold");
  if ((type === "expense" || type === "payout") && amount > 0) amount = -amount;
  if ((type === "contribution" || type === "sale_income") && amount < 0) amount = -amount;
  const db = await getDb();
  const fromCoffers = String(formData.get("from_coffers") || "") === "1";
  await db
    .update(ledger)
    .set({
      type,
      member: fromCoffers ? "" : String(formData.get("member") || qm.name),
      amountGold: amount,
      category: String(formData.get("category") || ""),
      description: String(formData.get("description") || ""),
    })
    .where(eq(ledger.id, id));
  revalidatePath("/admin", "layout");
}

export async function deleteLedgerAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  await db.delete(ledger).where(eq(ledger.id, String(formData.get("id"))));
  revalidatePath("/admin", "layout");
}

/** Set the ledger balance directly: posts one unattributed adjustment for the
 *  difference, so no member is distorted. */
export async function adjustBalanceAction(formData: FormData) {
  await quartermaster();
  const target = Number(formData.get("target_gold"));
  if (!Number.isFinite(target)) throw new Error("Enter a target balance");
  const db = await getDb();
  const rows = await db.select().from(ledger);
  const current = rows.reduce((a, e) => a + e.amountGold, 0);
  const diff = Math.round((target - current) * 100) / 100;
  if (!diff) throw new Error("Balance is already there — nothing to adjust");
  await db.insert(ledger).values({
    id: uid("lg"),
    type: diff > 0 ? "contribution" : "expense",
    member: "",
    amountGold: diff,
    category: "adjustment",
    description: `Balance adjustment to ${target}g (was ${Math.round(current * 100) / 100}g)`,
    actorDiscordId: "",
  });
  revalidatePath("/admin", "layout");
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
  const lowRaw = String(formData.get("low_threshold") || "").trim();
  const maxRaw = String(formData.get("max_stock") || "").trim();
  await db.insert(items).values({
    id: itemId,
    name,
    categorySlug: String(formData.get("category_slug") || "trade-goods"),
    description: String(formData.get("description") || ""),
    salePrice: Number(formData.get("sale_price") || 0),
    costValue: Number(formData.get("cost_value") || 0),
    active: String(formData.get("active") || "true") === "true",
    lowThreshold: lowRaw === "" ? null : Math.max(0, Number(lowRaw) || 0),
    buyPrice: Number(formData.get("buy_price") || 0),
    maxStock: maxRaw === "" ? null : Math.max(0, Number(maxRaw) || 0),
    parentId: null,
    inheritParent: true,
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
  const id = String(formData.get("id"));
  const lowRaw = String(formData.get("low_threshold") || "").trim();
  const maxRaw = String(formData.get("max_stock") || "").trim();
  const parentRaw = String(formData.get("parent_id") || "").trim();
  const parentId = parentRaw === "" ? null : parentRaw;
  const inheritParent = String(formData.get("inherit_parent") || "") === "on";
  if (parentId === id) throw new Error("An item cannot be its own parent");
  if (parentId) {
    const [parentRows, kidRows] = await Promise.all([
      db.select().from(items).where(eq(items.id, parentId)).limit(1),
      db.select({ id: items.id }).from(items).where(eq(items.parentId, id)),
    ]);
    const parent = parentRows[0];
    if (!parent) throw new Error("Parent not found");
    if (parent.parentId) throw new Error("Cannot nest variants — pick a top-level item");
    if (kidRows.length) throw new Error(`Has ${kidRows.length} variant(s) — delete or re-home them first`);
  }
  await db
    .update(items)
    .set({
      name: String(formData.get("name") || "Unnamed").trim(),
      categorySlug: String(formData.get("category_slug")),
      description: String(formData.get("description") || ""),
      salePrice: Number(formData.get("sale_price") || 0),
      costValue: Number(formData.get("cost_value") || 0),
      active: String(formData.get("active") || "true") === "true",
      lowThreshold: lowRaw === "" ? null : Math.max(0, Number(lowRaw) || 0),
      buyPrice: Number(formData.get("buy_price") || 0),
      maxStock: maxRaw === "" ? null : Math.max(0, Number(maxRaw) || 0),
      parentId,
      inheritParent: parentId ? inheritParent : true,
      updatedAt: new Date(),
    })
    .where(eq(items.id, id));
  revalidatePath("/", "layout");
}

export async function deleteItemAction(formData: FormData) {
  await quartermaster();
  const id = String(formData.get("id"));
  const db = await getDb();
  // Safe: sales + stock moves keep item-name snapshots, so history survives.
  const kids = await db.select({ id: items.id }).from(items).where(eq(items.parentId, id));
  if (kids.length) throw new Error(`Has ${kids.length} variant(s) — delete or re-home them first`);
  await db.delete(items).where(eq(items.id, id));
  revalidatePath("/", "layout");
}

/** Add a variant under a parent: copies category/price/cost/visibility. */
export async function createVariantAction(formData: FormData) {
  const qm = await quartermaster();
  const parentId = String(formData.get("parent_id"));
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Variant needs a name");
  const db = await getDb();
  const found = await db.select().from(items).where(eq(items.id, parentId)).limit(1);
  const parent = found[0];
  if (!parent) throw new Error("Parent not found");
  if (parent.parentId) throw new Error("Cannot nest variants — pick a top-level item");
  await db.insert(items).values({
    id: `${parent.id}-v-${slugify(name, Date.now().toString(36))}`,
    name,
    categorySlug: parent.categorySlug,
    description: "",
    salePrice: parent.salePrice,
    costValue: parent.costValue,
    active: parent.active,
    lowThreshold: parent.lowThreshold,
    buyPrice: parent.buyPrice,
    maxStock: parent.maxStock,
    parentId: parent.id,
    inheritParent: true,
    createdByDiscordId: qm.discordId,
    createdByName: qm.name,
  });
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
}

export async function resolveNoteAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  const done = String(formData.get('resolved') || 'false') === 'true';
  await db.update(notes).set({ resolved: !done }).where(eq(notes.id, String(formData.get('id'))));
  revalidatePath('/admin', 'layout');
}

export async function deleteNoteAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  await db.delete(notes).where(eq(notes.id, String(formData.get('id'))));
  revalidatePath('/admin', 'layout');
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
}

/** Shop open/closed toggle (salesperson on duty). Shows publicly in the hero. */
export async function setShopOpenAction(formData: FormData) {
  await quartermaster();
  await setShopOpen(String(formData.get('open')) === '1');
  revalidatePath('/', 'layout');
  revalidatePath('/admin', 'layout');
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

// ---------- storage rentals (barrels/chests outside the keep) ----------
// Income posts straight to company coffers: unattributed (blank member) so it
// never dilutes per-member splits. Balances only move on splits and manual rows.

export async function rentUnitAction(formData: FormData) {
  const qm = await quartermaster();
  const id = String(formData.get("id"));
  const occupant = String(formData.get("occupant") || "").trim();
  if (!occupant) throw new Error("Name the occupant");
  const db = await getDb();
  await db.update(storageUnits).set({
    occupant, occupiedSince: new Date(), paidThrough: new Date(),
  }).where(eq(storageUnits.id, id));
  void qm;
  revalidatePath("/admin", "layout");
}

export async function collectUnitAction(formData: FormData) {
  const qm = await quartermaster();
  const id = String(formData.get("id"));
  const db = await getDb();
  const found = await db.select().from(storageUnits).where(eq(storageUnits.id, id)).limit(1);
  const u = found[0];
  if (!u || !u.occupant) throw new Error("Unit is empty");
  const picked = String(formData.get("paid_from") || "");
  const pickedDate = picked ? new Date(`${picked}T12:00:00`) : null;
  const current = u.paidThrough ? new Date(u.paidThrough) : null;
  const base =
    pickedDate && !Number.isNaN(pickedDate.getTime()) ? pickedDate
    : current && current > new Date() ? current
    : new Date();
  const next = new Date(base.getTime() + 7 * 24 * 3600 * 1000);
  await db.update(storageUnits).set({ paidThrough: next }).where(eq(storageUnits.id, id));
  await db.insert(ledger).values({
    id: uid("lg"),
    type: "sale_income",
    member: "",
    amountGold: Math.round(u.ratePerWeek * 100) / 100,
    category: "storage",
    description: `Storage rent [unit:${u.id}]: ${u.label} × 1 week (${u.occupant}) from ${base.toISOString().slice(0, 10)}`,
    actorDiscordId: qm.discordId,
  });
  revalidatePath("/admin", "layout");
}

export async function freeUnitAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  await db.update(storageUnits).set({ occupant: "", occupiedSince: null, paidThrough: null })
    .where(eq(storageUnits.id, String(formData.get("id"))));
  revalidatePath("/admin", "layout");
}

export async function addUnitAction(formData: FormData) {
  const qm = await quartermaster();
  const label = String(formData.get("label") || "").trim() || `Chest ${Date.now().toString(36)}`;
  const location = String(formData.get("location") || "").trim() || "Darkwater Crossing";
  const db = await getDb();
  await db.insert(storageUnits).values({
    id: `unit-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    label,
    ratePerWeek: Number(formData.get("rate_per_week") || 60),
    location,
  });
  void qm;
  revalidatePath("/admin", "layout");
}

export async function updateUnitAction(formData: FormData) {
  await quartermaster();
  const rate = Number(formData.get("rate_per_week") || 0);
  if (!(rate >= 0)) throw new Error("Rate must be 0 or more");
  const label = String(formData.get("label") || "").trim();
  if (!label) throw new Error("Label cannot be empty");
  const location = String(formData.get("location") || "").trim() || "Darkwater Crossing";
  const db = await getDb();
  await db.update(storageUnits).set({
    label,
    ratePerWeek: rate,
    location,
    kind: String(formData.get("kind") || "rental"),
    secured: String(formData.get("secured") || "") === "1",
  }).where(eq(storageUnits.id, String(formData.get("id"))));
  revalidatePath("/admin", "layout");
}

export async function deleteUnitAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  const found = await db.select().from(storageUnits).where(eq(storageUnits.id, String(formData.get("id")))).limit(1);
  if (found[0]?.occupant) throw new Error("Free the unit first");
  await db.delete(storageUnits).where(eq(storageUnits.id, String(formData.get("id"))));
  revalidatePath("/admin", "layout");
}

// ---------- members (explicit roster; splits use active members) ----------

export async function addMemberAction(formData: FormData) {
  await quartermaster();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Name the member");
  const db = await getDb();
  await db.insert(members).values({
    id: `mb-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    active: true,
  }).onConflictDoNothing({ target: members.name });
  revalidatePath("/admin", "layout");
}

export async function setMemberActiveAction(formData: FormData) {
  await quartermaster();
  const db = await getDb();
  await db.update(members)
    .set({ active: String(formData.get("active")) === "true" })
    .where(eq(members.id, String(formData.get("id"))));
  revalidatePath("/admin", "layout");
}

/** End-of-day sweep: move gold from the register lockbox to the safe. */
export async function sweepCashAction(formData: FormData) {
  const qm = await quartermaster();
  const amount = Math.round(Number(formData.get("amount_gold") || 0) * 100) / 100;
  if (!(amount > 0)) throw new Error("Amount must be more than 0");
  const db = await getDb();
  const moves = await db.select().from(cashMoves);
  const lockbox = moves.filter((m) => m.pot === "Lockbox").reduce((a, m) => a + m.delta, 0);
  if (amount - lockbox > 0.005) {
    throw new Error(`Only ${Math.round(lockbox * 100) / 100}g in the lockbox — can't sweep ${amount}g`);
  }
  const stamp = uid("cm").slice(0, 20);
  await db.insert(cashMoves).values({
    id: `${stamp}-out`,
    pot: "Lockbox",
    delta: -amount,
    reason: `End-of-day sweep to Safe`,
    actorDiscordId: qm.discordId,
    actorName: qm.name,
  });
  await db.insert(cashMoves).values({
    id: `${stamp}-in`,
    pot: "Safe",
    delta: amount,
    reason: `End-of-day sweep from Lockbox`,
    actorDiscordId: qm.discordId,
    actorName: qm.name,
  });
  revalidatePath("/admin", "layout");
}

/** Manual cash adjustment: starting float, found gold, corrections. Positive adds, negative removes. */
export async function adjustCashAction(formData: FormData) {
  const qm = await quartermaster();
  const pot = String(formData.get("pot") || "Lockbox");
  if (pot !== "Lockbox" && pot !== "Safe") throw new Error("Unknown pot");
  const amount = Math.round(Number(formData.get("amount_gold") || 0) * 100) / 100;
  if (!amount) throw new Error("Amount must not be zero");
  const reason = String(formData.get("reason") || "Manual adjustment").trim() || "Manual adjustment";
  const db = await getDb();
  await db.insert(cashMoves).values({
    id: uid("cm"),
    pot,
    delta: amount,
    reason,
    actorDiscordId: qm.discordId,
    actorName: qm.name,
  });
  revalidatePath("/admin", "layout");
}
