"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAdminSession, requireAdmin } from "./session";
import { upsertItem, adjustStock, recordSale, addLedger, addOrder, setOrderStatus, getItems } from "./sheets";

const ADMIN_PASSWORD = () => process.env.ADMIN_PASSWORD || "merchantlight";

export async function loginAction(formData: FormData) {
  const charName = String(formData.get("charName") || "").trim();
  const password = String(formData.get("password") || "");
  if (!charName) throw new Error("Pick a character name");
  if (password !== ADMIN_PASSWORD()) throw new Error("Wrong password");
  const s = await getAdminSession();
  s.isAdmin = true;
  s.charName = charName;
  s.loggedInAt = new Date().toISOString();
  await s.save();
  redirect("/admin");
}

export async function logoutAction() {
  const s = await getAdminSession();
  s.destroy();
  redirect("/admin/login");
}

export async function saveItemAction(formData: FormData) {
  const s = await requireAdmin();
  const id = String(formData.get("id") || `it-${Date.now()}`);
  const items = await getItems();
  const existing = items.find((x) => x.id === id);
  await upsertItem(
    {
      id,
      name: String(formData.get("name") || "Unnamed"),
      category_slug: String(formData.get("category_slug") || "trade-goods"),
      description: String(formData.get("description") || ""),
      sale_price: Number(formData.get("sale_price") || 0),
      cost_value: Number(formData.get("cost_value") || 0),
      stock: Number(formData.get("stock") || 0),
      low_threshold: Number(formData.get("low_threshold") || 2),
      image_url: String(formData.get("image_url") || ""),
      active: String(formData.get("active") || "true") === "true",
      created_by_char: existing?.created_by_char || s.charName,
      updated_by_char: s.charName,
      updated_at: new Date().toISOString(),
    },
    s.charName
  );
  revalidatePath("/", "layout");
  redirect("/admin/inventory");
}

export async function adjustStockAction(formData: FormData) {
  const s = await requireAdmin();
  await adjustStock(String(formData.get("item_id")), Number(formData.get("delta")), s.charName);
  revalidatePath("/", "layout");
  redirect("/admin/inventory");
}

export async function recordSaleAction(formData: FormData) {
  const s = await requireAdmin();
  await recordSale({
    item_id: String(formData.get("item_id")),
    qty: Number(formData.get("qty") || 1),
    unit_sale_price: Number(formData.get("unit_sale_price") || 0),
    unit_cost_snapshot: Number(formData.get("unit_cost") || 0),
    location: String(formData.get("location") || "Windhelm"),
    sold_by_char: s.charName,
    notes: String(formData.get("notes") || ""),
  });
  revalidatePath("/", "layout");
  redirect("/admin/sales");
}

export async function addLedgerAction(formData: FormData) {
  const s = await requireAdmin();
  const type = String(formData.get("type")) as "contribution" | "expense" | "payout" | "sale_income";
  let amount = Number(formData.get("amount_gold") || 0);
  if ((type === "expense" || type === "payout") && amount > 0) amount = -amount;
  if ((type === "contribution" || type === "sale_income") && amount < 0) amount = -amount;
  await addLedger({
    type,
    member_char: String(formData.get("member_char") || s.charName),
    amount_gold: amount,
    category: String(formData.get("category") || ""),
    description: String(formData.get("description") || ""),
  });
  revalidatePath("/", "layout");
  redirect("/admin/ledger");
}

export async function submitOrderAction(formData: FormData) {
  await addOrder({
    customer_char: String(formData.get("customer_char") || "Nameless Traveler"),
    discord_handle: String(formData.get("discord_handle") || ""),
    item_id: String(formData.get("item_id") || ""),
    qty: Number(formData.get("qty") || 1),
    pickup_location: String(formData.get("pickup_location") || "Windhelm"),
    notes: String(formData.get("notes") || ""),
  });
  revalidatePath("/", "layout");
  redirect("/order?ok=1");
}

export async function setOrderStatusAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as "new" | "accepted" | "fulfilled" | "cancelled";
  await setOrderStatus(id, status);
  // If fulfilled, optionally auto-record sale
  if (status === "fulfilled" && String(formData.get("auto_sale")) === "1") {
    const s = await getAdminSession();
    await recordSale({
      item_id: String(formData.get("item_id")),
      qty: Number(formData.get("qty") || 1),
      unit_sale_price: Number(formData.get("unit_sale_price") || 0),
      unit_cost_snapshot: 0,
      location: String(formData.get("pickup_location") || "Windhelm"),
      sold_by_char: s.charName || "Quartermaster",
      notes: `Order ${id}`,
    });
  }
  revalidatePath("/", "layout");
  redirect("/admin/orders");
}
