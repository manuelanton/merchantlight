import { asService, asUser } from "@/lib/merchant-db";

// Reads for the backoffice. Everything runs as the signed-in user, so RLS decides what comes back.

export interface SaleRow {
  id: string;
  receipt_no: number;
  sale_date: string | Date;
  customer: string | null;
  seller: string;
  status: "draft" | "posted";
  total: number;
  profit: number | null;
  items: number;
}

export interface Good {
  id: string;
  name: string;
  category: string;
  sell_price: number;
  buy_price: number | null;
  stock: number;
  min_stock: number;
  is_bundle: boolean;
  profession: string | null;
  craft_yield: number;
  parts: number;
}

export interface PartnerWeek {
  week_start: string;
  closed: boolean;
  sales_income: number;
  other_income: number;
  expenses: number;
  net: number;
  per_partner: number | null;
  partners: { id: string; name: string; amount?: number }[];
}

export interface PartnerBalance {
  partner_id: string;
  name: string;
  earned: number;
  paid: number;
  balance: number;
}

export interface TreasuryRow {
  id: number;
  entry_date: string | Date;
  category: string;
  description: string | null;
  money_in: number;
  money_out: number;
  ref_type: string | null;
}

const SALE_SELECT = `
  select s.id, s.receipt_no, s.sale_date, s.customer, s.status,
         coalesce(p.display_name, p.username, s.seller_name, 'Unknown') as seller,
         coalesce(s.net_total, l.subtotal - s.discount, 0) as total,
         s.net_total - s.cost_total as profit,
         coalesce(l.items, 0) as items
  from merchant.sales s
  left join merchant.profiles p on p.id = s.seller_id
  left join lateral (
    select sum(x.quantity * x.unit_price) as subtotal, sum(x.quantity) as items
    from merchant.sale_lines x where x.sale_id = s.id
  ) l on true`;

export function todaysSales(profileId: string) {
  return asUser<SaleRow>(
    profileId,
    `${SALE_SELECT} where (s.sale_date at time zone 'UTC')::date = (now() at time zone 'UTC')::date
     order by s.sale_date desc`,
  );
}

export function listSales(profileId: string, filter: { q?: string; status?: string }) {
  const status = filter.status === "posted" || filter.status === "draft" ? filter.status : null;
  return asUser<SaleRow>(
    profileId,
    `${SALE_SELECT}
     where ($1::text is null or s.status::text = $1)
       and ($2::text is null or s.receipt_no::text = $2 or s.customer ilike '%' || $2 || '%'
            or coalesce(p.display_name, p.username, '') ilike '%' || $2 || '%')
     order by s.sale_date desc limit 200`,
    [status, filter.q?.trim() || null],
  );
}

export async function getSale(profileId: string, id: string) {
  const [sale] = await asUser<SaleRow & { discount: number; tip: number; notes: string | null; subtotal: number | null }>(
    profileId,
    `select r.*, x.discount, x.tip, x.notes, x.subtotal
     from (${SALE_SELECT} where s.id = $1) r
     join merchant.sales x on x.id = r.id`,
    [id],
  );
  if (!sale) return null;
  const lines = await asUser<{ id: string; good_name: string; quantity: number; unit_price: number }>(
    profileId,
    `select id, good_name, quantity, unit_price from merchant.sale_lines where sale_id = $1 order by created_at`,
    [id],
  );
  return { sale, lines };
}

export function listGoods(profileId: string) {
  return asUser<Good>(
    profileId,
    `select g.id, g.name, g.category, g.sell_price, g.buy_price, g.stock, g.min_stock, g.is_bundle, g.profession, g.craft_yield,
            (select count(*)::int from merchant.recipe_components r where r.good_id = g.id) as parts
     from merchant.goods g where g.active order by g.category, g.name`,
  );
}

export interface Analytics {
  days: { day: string; revenue: number; profit: number; receipts: number }[];
  items: { name: string; revenue: number; quantity: number }[];
  categories: { name: string; revenue: number }[];
  people: { name: string; receipts: number; revenue: number; profit: number; tips: number }[];
  net: number;
  balances: { day: string; balance: number }[];
  goods_value: number;
  materials_value: number;
}

const utcDay = (column: string) => `(${column} at time zone 'UTC')::date`;
const inRange = (column: string) => `($1::date is null or ${utcDay(column)} >= $1::date) and ($2::date is null or ${utcDay(column)} <= $2::date)`;

/** Everything the Analytics page shows for a range; either end may stay open. */
export async function analytics(profileId: string, from: string | null, to: string | null): Promise<Analytics> {
  const range = [from, to];
  const [days, items, people, totals, balances, [stock]] = await Promise.all([
    asUser<Analytics["days"][number]>(
      profileId,
      `select ${utcDay("sale_date")}::text as day, sum(net_total) as revenue, sum(net_total - cost_total) as profit, count(*)::int as receipts
       from merchant.sales where status = 'posted' and ${inRange("sale_date")} group by 1 order by 1`,
      range,
    ),
    asUser<Analytics["items"][number] & { category: string | null }>(
      profileId,
      `select l.good_name as name, l.category, sum(l.quantity * l.unit_price) as revenue, sum(l.quantity) as quantity
       from merchant.sale_lines l join merchant.sales s on s.id = l.sale_id
       where s.status = 'posted' and ${inRange("s.sale_date")} group by 1, 2 order by 3 desc`,
      range,
    ),
    asUser<Analytics["people"][number]>(
      profileId,
      `select coalesce(max(seller_name), 'Unknown') as name, count(*)::int as receipts, sum(net_total) as revenue,
              sum(net_total - cost_total) as profit, sum(tip) as tips
       from merchant.sales where status = 'posted' and ${inRange("sale_date")} group by seller_id order by 3 desc`,
      range,
    ),
    asUser<{ net: number }>(
      profileId,
      `select coalesce(sum(money_in) filter (where category <> 'Deposit'), 0)
             - coalesce(sum(money_out) filter (where category not in ('Withdrawal', 'Partner payout')), 0) as net
       from merchant.treasury_entries where ${inRange("entry_date")}`,
      range,
    ),
    asUser<Analytics["balances"][number]>(
      profileId,
      `select day::text, sum(moved) over (order by day) as balance
       from (select ${utcDay("entry_date")} as day, sum(money_in - money_out) as moved from merchant.treasury_entries group by 1) d
       order by day`,
    ),
    asUser<{ goods_value: number; materials_value: number }>(
      profileId,
      `select coalesce((select sum(greatest(g.stock, 0) * coalesce(c.unit_cost, 0)) from merchant.goods g
                        left join merchant.good_costs() c on c.good_id = g.id where g.active), 0) as goods_value,
              coalesce((select sum(greatest(stock, 0) * buy_price) from merchant.materials where active), 0) as materials_value`,
    ),
  ]);
  const categories = new Map<string, number>();
  for (const i of items) categories.set(i.category ?? "Other", (categories.get(i.category ?? "Other") ?? 0) + i.revenue);
  return {
    days,
    items,
    categories: [...categories].map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue),
    people,
    net: totals[0].net,
    balances,
    ...stock,
  };
}

export const isLow = (item: { stock: number; min_stock: number }) => item.min_stock > 0 && item.stock <= item.min_stock;

export async function partnerWeek(profileId: string, week: string) {
  const [row] = await asUser<{ w: PartnerWeek }>(profileId, `select merchant.partner_week($1::date) as w`, [week]);
  return row.w;
}

export function partnerBalances(profileId: string) {
  return asUser<PartnerBalance>(profileId, `select * from merchant.partner_balances()`);
}

export function treasuryEntries(profileId: string, category?: string) {
  return asUser<TreasuryRow>(
    profileId,
    `select id, entry_date, category, description, money_in, money_out, ref_type
     from merchant.treasury_entries
     where ($1::text is null or category = $1)
     order by entry_date desc, id desc limit 50`,
    [category ?? null],
  );
}

export async function treasuryBalance(profileId: string) {
  const [row] = await asUser<{ balance: number }>(profileId, `select merchant.treasury_balance() as balance`);
  return row.balance;
}

export function treasuryCategories(profileId: string) {
  return asUser<{ name: string; direction: "in" | "out" | "both" }>(
    profileId,
    `select name, direction from merchant.treasury_categories where not is_system order by sort_order`,
  );
}

/** Monday of the week `date` falls in, as yyyy-mm-dd (UTC, like the partner split). */
export function weekStart(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Stock, purchases, rentals ------------------------------------------------------

export interface Material {
  id: string;
  name: string;
  category: string;
  buy_price: number;
  stock: number;
  min_stock: number;
}

export function listMaterials(profileId: string) {
  return asUser<Material>(
    profileId,
    `select id, name, category, buy_price, stock, min_stock from merchant.materials where active order by category, name`,
  );
}

export interface PurchaseRow {
  id: string;
  purchase_no: number;
  purchase_date: string | Date;
  supplier: string | null;
  buyer: string | null;
  total: number;
  summary: string;
}

export function listPurchases(profileId: string) {
  return asUser<PurchaseRow>(
    profileId,
    `select p.id, p.purchase_no, p.purchase_date, p.supplier, p.created_by_name as buyer, p.total,
            (select string_agg(l.quantity || '× ' || l.item_name, ', ') from merchant.purchase_lines l where l.purchase_id = p.id) as summary
     from merchant.purchases p order by p.purchase_date desc limit 50`,
  );
}

export interface RentalUnit {
  id: string;
  name: string;
  weekly_price: number;
  notes: string | null;
  location: string;
  kind: "rental" | "internal";
  secured: boolean;
  has_history: boolean;
  rental_id: string | null;
  renter: string | null;
  rate: number | null;
  start_date: string | null;
  paid_until: string | null;
  days_left: number | null;
}

export function listUnits(profileId: string) {
  return asUser<RentalUnit>(
    profileId,
    `select u.id, u.name, u.weekly_price, u.notes, u.location, u.kind, u.secured,
            exists (select 1 from merchant.rentals x where x.unit_id = u.id) as has_history,
            r.id as rental_id, r.renter, r.weekly_price as rate, r.start_date::text, r.paid_until::text,
            r.paid_until - current_date as days_left
     from merchant.storage_units u
     left join merchant.rentals r on r.unit_id = u.id and r.ended_at is null
     where u.active order by u.location, u.kind, u.name`,
  );
}

export interface RentalRow {
  id: string;
  unit: string;
  renter: string;
  start_date: string;
  paid_until: string;
  paid: number;
  ended: boolean;
}

export function rentalHistory(profileId: string) {
  return asUser<RentalRow>(
    profileId,
    `select r.id, u.name as unit, r.renter, r.start_date::text, r.paid_until::text,
            r.weeks * r.weekly_price as paid, r.ended_at is not null as ended
     from merchant.rentals r join merchant.storage_units u on u.id = r.unit_id
     order by r.created_at desc limit 50`,
  );
}

/** For the public landing page, which has no signed-in user. */
export async function rentalSpace(site: string) {
  const [row] = await asService<{ units: number; free: number }>(
    `select count(*)::int as units, (count(*) - count(r.id))::int as free
     from merchant.storage_units u
     left join merchant.rentals r on r.unit_id = u.id and r.ended_at is null
     where u.active and u.kind = 'rental' and u.location = $1`,
    [site],
  );
  return row;
}

// Recipes and crafting -----------------------------------------------------------

export async function getGood(profileId: string, id: string) {
  const [good] = await asUser<Good & { unit_cost: number | null; cost_error: string | null }>(
    profileId,
    `select g.id, g.name, g.category, g.sell_price, g.buy_price, g.stock, g.min_stock, g.is_bundle, g.profession, g.craft_yield,
            c.unit_cost, c.cost_error
     from merchant.goods g
     left join merchant.good_costs() c on c.good_id = g.id
     where g.id = $1`,
    [id],
  );
  return good ?? null;
}

export function recipeLines(profileId: string, goodId: string) {
  return asUser<{ id: string; name: string; quantity: number; stock: number }>(
    profileId,
    `select r.id, coalesce(m.name, c.name) as name, r.quantity, coalesce(m.stock, c.stock) as stock
     from merchant.recipe_components r
     left join merchant.materials m on m.id = r.material_id
     left join merchant.goods c on c.id = r.component_good_id
     where r.good_id = $1 order by r.created_at`,
    [goodId],
  );
}

export interface Recipe {
  id: string;
  name: string;
  profession: string | null;
  stock: number;
  craft_yield: number;
  parts: string;
  max_qty: number;
  limiting: string | null;
}

/** Bundles have a recipe too, but they are taken apart when sold, not crafted. */
export function listRecipes(profileId: string) {
  return asUser<Recipe>(
    profileId,
    `select g.id, g.name, g.profession, g.stock, g.craft_yield, cap.max_qty, cap.limiting,
            (select string_agg(r.quantity || '× ' || coalesce(m.name, c.name), ', ' order by r.created_at)
             from merchant.recipe_components r
             left join merchant.materials m on m.id = r.material_id
             left join merchant.goods c on c.id = r.component_good_id
             where r.good_id = g.id) as parts
     from merchant.goods g
     left join merchant.craft_capacity() cap on cap.good_id = g.id
     where g.active and not g.is_bundle
       and exists (select 1 from merchant.recipe_components r where r.good_id = g.id)
     order by g.profession nulls last, g.name`,
  );
}

export function listCrafts(profileId: string) {
  return asUser<{ id: string; good_name: string; quantity: number; created_at: string | Date; created_by_name: string | null }>(
    profileId,
    `select id, good_name, quantity, created_at, created_by_name from merchant.crafts order by created_at desc limit 20`,
  );
}
