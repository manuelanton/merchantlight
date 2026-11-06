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
}

export interface PartnerWeek {
  week_start: string;
  closed: boolean;
  sales_profit: number;
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
    `select id, name, category, sell_price, buy_price, stock, min_stock, is_bundle
     from merchant.goods where active order by category, name`,
  );
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
