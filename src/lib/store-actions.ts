"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { num } from "@/lib/format";
import { asUser } from "@/lib/merchant-db";
import { rpcError } from "@/lib/merchant-rpc";
import { setShopOpen } from "@/lib/shop";
import { requireManager, requireOwner, requireStaff } from "@/lib/store-access";

/** Runs a write; a refusal comes back to `path` as ?error=, shown by <Notice>. */
async function attempt(path: string, write: () => Promise<unknown>) {
  let error: string | null = null;
  try {
    await write();
  } catch (e) {
    error = rpcError(e).error;
  }
  revalidatePath("/admin", "layout");
  if (error) redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}`);
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function setOpenAction(form: FormData) {
  await requireManager();
  await setShopOpen(text(form, "open") === "1");
  revalidatePath("/", "layout");
}

export async function createReceiptAction(form: FormData) {
  const access = await requireStaff();
  const post = text(form, "post") === "1";
  let saleId = "";
  await attempt("/admin/sales/new", async () => {
    const [sale] = await asUser<{ id: string }>(
      access.profileId,
      `select id from merchant.create_receipt($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [access.profileId, text(form, "customer"), num(form.get("discount")), num(form.get("tip")), text(form, "notes"), text(form, "lines") || "[]", post],
    );
    saleId = sale.id;
  });
  redirect(`/admin/sales/${saleId}`);
}

export async function postReceiptAction(form: FormData) {
  const access = await requireStaff();
  const id = text(form, "id");
  await attempt(`/admin/sales/${id}`, () => asUser(access.profileId, `select merchant.post_sale($1)`, [id]));
}

export async function reopenReceiptAction(form: FormData) {
  const access = await requireStaff();
  const id = text(form, "id");
  await attempt(`/admin/sales/${id}`, () => asUser(access.profileId, `select merchant.unpost_sale($1)`, [id]));
}

export async function deleteReceiptAction(form: FormData) {
  const access = await requireStaff();
  const id = text(form, "id");
  await attempt(`/admin/sales/${id}`, async () => {
    // RLS hides what this user may not delete, which would otherwise look like success.
    const rows = await asUser(access.profileId, `delete from merchant.sales where id = $1 returning id`, [id]);
    if (!rows.length) throw Object.assign(new Error("Not allowed"), { code: "42501" });
  });
  redirect("/admin/sales");
}

export async function saveItemAction(form: FormData) {
  const access = await requireManager();
  const id = text(form, "id");
  const fields = [text(form, "name"), text(form, "category") || "Other", num(form.get("sell_price")), num(form.get("buy_price")), num(form.get("min_stock"))];
  await attempt(id ? `/admin/items/${id}` : "/admin/items", () =>
    id
      ? asUser(access.profileId, `update merchant.goods set name = $1, category = $2, sell_price = $3, buy_price = $4, min_stock = $5 where id = $6`, [...fields, id])
      : asUser(access.profileId, `insert into merchant.goods (name, category, sell_price, buy_price, min_stock) values ($1, $2, $3, $4, $5)`, fields),
  );
}

/** Rows with a step button add it; otherwise the typed number is the new stock. */
export async function setStockAction(form: FormData) {
  const access = await requireManager();
  const kind = text(form, "kind") === "material" ? "material" : "good";
  const id = text(form, "id");
  await attempt("/admin/stock", async () => {
    let delta = num(form.get("step"));
    if (!delta) {
      const table = kind === "material" ? "materials" : "goods";
      const [row] = await asUser<{ stock: number }>(access.profileId, `select stock from merchant.${table} where id = $1`, [id]);
      delta = num(form.get("target"), row.stock) - row.stock;
    }
    if (delta) await asUser(access.profileId, `select merchant.adjust_stock($1, $2, $3, 'Correction', 'Manual edit on Stock screen')`, [kind, id, delta]);
  });
}

export async function saveMaterialAction(form: FormData) {
  const access = await requireManager();
  const id = text(form, "id");
  const fields = [text(form, "name"), num(form.get("buy_price")), num(form.get("min_stock"))];
  await attempt("/admin/items", () =>
    id
      ? asUser(access.profileId, `update merchant.materials set name = $1, buy_price = $2, min_stock = $3 where id = $4`, [...fields, id])
      : asUser(access.profileId, `insert into merchant.materials (name, buy_price, min_stock) values ($1, $2, $3)`, fields),
  );
}

export async function addRecipeLineAction(form: FormData) {
  const access = await requireManager();
  const good = text(form, "good");
  const [kind, part] = text(form, "part").split(":");
  const column = kind === "material" ? "material_id" : "component_good_id";
  await attempt(`/admin/items/${good}`, () =>
    asUser(access.profileId, `insert into merchant.recipe_components (good_id, ${column}, quantity) values ($1, $2, $3)`, [good, part, num(form.get("quantity"), 1)]),
  );
}

export async function removeRecipeLineAction(form: FormData) {
  const access = await requireManager();
  const good = text(form, "good");
  await attempt(`/admin/items/${good}`, () => asUser(access.profileId, `delete from merchant.recipe_components where id = $1`, [text(form, "id")]));
}

export async function saveRecipeAction(form: FormData) {
  const access = await requireManager();
  const good = text(form, "good");
  await attempt(`/admin/items/${good}`, () =>
    asUser(access.profileId, `update merchant.goods set profession = $1, craft_yield = $2 where id = $3`, [text(form, "profession") || null, num(form.get("craft_yield"), 1), good]),
  );
}

export async function craftAction(form: FormData) {
  const access = await requireStaff();
  await attempt("/admin/craft", () => asUser(access.profileId, `select merchant.craft($1, $2)`, [text(form, "id"), num(form.get("qty"))]));
}

export async function deleteCraftAction(form: FormData) {
  const access = await requireManager();
  await attempt("/admin/craft", () => asUser(access.profileId, `delete from merchant.crafts where id = $1`, [text(form, "id")]));
}

export async function createPurchaseAction(form: FormData) {
  const access = await requireManager();
  await attempt("/admin/purchases", () =>
    asUser(access.profileId, `select merchant.create_purchase($1::jsonb, $2, $3, $4)`, [text(form, "lines") || "[]", text(form, "supplier"), text(form, "notes") || null, form.get("update_prices") === "1"]),
  );
}

export async function deletePurchaseAction(form: FormData) {
  const access = await requireManager();
  await attempt("/admin/purchases", () => asUser(access.profileId, `delete from merchant.purchases where id = $1`, [text(form, "id")]));
}

export async function saveUnitAction(form: FormData) {
  const access = await requireManager();
  const id = text(form, "id");
  const fields = [text(form, "name"), num(form.get("weekly_price")), text(form, "location"), text(form, "kind") === "internal" ? "internal" : "rental", form.get("secured") === "1"];
  await attempt("/admin/rentals", () =>
    id
      ? asUser(access.profileId, `update merchant.storage_units set name = $1, weekly_price = $2, location = $3, kind = $4, secured = $5 where id = $6`, [...fields, id])
      : asUser(access.profileId, `insert into merchant.storage_units (name, weekly_price, location, kind, secured) values ($1, $2, $3, $4, $5)`, fields),
  );
}

export async function deleteUnitAction(form: FormData) {
  const access = await requireManager();
  await attempt("/admin/rentals", () => asUser(access.profileId, `delete from merchant.storage_units where id = $1`, [text(form, "id")]));
}

export async function rentOutAction(form: FormData) {
  const access = await requireManager();
  await attempt("/admin/rentals", () =>
    asUser(access.profileId, `select merchant.create_rental($1, $2, $3)`, [text(form, "id"), text(form, "renter"), Math.trunc(num(form.get("weeks"), 1))]),
  );
}

export async function extendRentalAction(form: FormData) {
  const access = await requireManager();
  await attempt("/admin/rentals", () =>
    asUser(access.profileId, `select merchant.extend_rental($1, $2)`, [text(form, "id"), Math.trunc(num(form.get("weeks"), 1))]),
  );
}

export async function endRentalAction(form: FormData) {
  const access = await requireManager();
  await attempt("/admin/rentals", () => asUser(access.profileId, `select merchant.end_rental($1)`, [text(form, "id")]));
}

export async function deleteRentalAction(form: FormData) {
  const access = await requireManager();
  await attempt("/admin/rentals", () => asUser(access.profileId, `delete from merchant.rentals where id = $1`, [text(form, "id")]));
}

export async function payBuildingRentAction(form: FormData) {
  const access = await requireManager();
  const amount = text(form, "amount");
  await attempt("/admin/rentals", () =>
    asUser(access.profileId, `select merchant.pay_building_rent($1, $2)`, [Math.floor(num(form.get("days"))), amount ? num(amount) : null]),
  );
}

export async function saveBuildingRentAction(form: FormData) {
  const access = await requireOwner();
  await attempt("/admin/rentals", () =>
    asUser(
      access.profileId,
      `update merchant.settings set building_rent_per_day = $1, rent_paid_until = $2::timestamp at time zone 'UTC'`,
      [num(form.get("per_day")), text(form, "paid_until") || null],
    ),
  );
}

export async function setProfitShareAction(form: FormData) {
  const access = await requireOwner();
  await attempt("/admin/users", () =>
    asUser(access.profileId, `select merchant.set_profit_share($1, $2)`, [text(form, "id"), text(form, "on") === "1"]),
  );
}

export async function addTreasuryEntryAction(form: FormData) {
  const access = await requireManager();
  const amount = num(form.get("amount"));
  const isIn = text(form, "direction") === "in";
  await attempt("/admin/treasury", () =>
    asUser(
      access.profileId,
      `insert into merchant.treasury_entries (category, description, money_in, money_out) values ($1, $2, $3, $4)`,
      [text(form, "category"), text(form, "description") || null, isIn ? amount : 0, isIn ? 0 : amount],
    ),
  );
}

export async function closeWeekAction(form: FormData) {
  const access = await requireManager();
  const week = text(form, "week");
  await attempt(`/admin/payments?week=${week}`, () => asUser(access.profileId, `select merchant.close_partner_week($1::date)`, [week]));
}

export async function reopenWeekAction(form: FormData) {
  const access = await requireManager();
  const week = text(form, "week");
  await attempt(`/admin/payments?week=${week}`, () => asUser(access.profileId, `select merchant.reopen_partner_week($1::date)`, [week]));
}

export async function payPartnerAction(form: FormData) {
  const access = await requireManager();
  const week = text(form, "week");
  await attempt(`/admin/payments?week=${week}`, () =>
    asUser(access.profileId, `select merchant.pay_partner($1, $2, $3)`, [text(form, "partner"), num(form.get("amount")), text(form, "note") || null]),
  );
}
