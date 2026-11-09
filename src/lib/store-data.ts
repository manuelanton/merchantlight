import { asService, asUser } from "@/lib/merchant-db";

const PAGE_SIZE = 50;
const utcDay = (column: string) => `(${column} at time zone 'UTC')::date`;

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

export interface PartnerLedger {
  partner_id: string;
  name: string;
  carried: number;
  share: number;
  paid: number;
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

export interface SaleFilter {
  q?: string;
  status?: string;
  seller?: string;
  from?: string | null;
  to?: string | null;
  page?: number;
}

const SALE_WHERE = `
  where ($1::text is null or s.status::text = $1)
    and ($2::text is null or s.receipt_no::text = $2 or s.customer ilike '%' || $2 || '%'
         or coalesce(p.display_name, p.username, '') ilike '%' || $2 || '%')
    and ($3::uuid is null or s.seller_id = $3)
    and ($4::date is null or ${utcDay("s.sale_date")} >= $4::date)
    and ($5::date is null or ${utcDay("s.sale_date")} <= $5::date)`;

const saleParams = (f: SaleFilter) => [
  f.status === "posted" || f.status === "draft" ? f.status : null,
  f.q?.trim() || null,
  f.seller && /^[0-9a-f-]{36}$/.test(f.seller) ? f.seller : null,
  f.from ?? null,
  f.to ?? null,
];

export function listSales(profileId: string, filter: SaleFilter) {
  return asUser<SaleRow>(
    profileId,
    `${SALE_SELECT} ${SALE_WHERE} order by s.sale_date desc limit ${PAGE_SIZE} offset $6`,
    [...saleParams(filter), (filter.page ?? 0) * PAGE_SIZE],
  );
}

/** Each day's totals under the same filters, so a day's header is right on every page. */
export function salesDays(profileId: string, filter: SaleFilter) {
  return asUser<{ day: string; receipts: number; revenue: number; profit: number }>(
    profileId,
    `select ${utcDay("r.sale_date")}::text as day, count(*)::int as receipts,
            coalesce(sum(r.total) filter (where r.status = 'posted'), 0) as revenue,
            coalesce(sum(r.profit) filter (where r.status = 'posted'), 0) as profit
     from (${SALE_SELECT} ${SALE_WHERE}) r group by 1 order by 1 desc`,
    saleParams(filter),
  );
}

/** Who can be filtered by, and the names the search can suggest. */
export async function saleOptions(profileId: string) {
  const [sellers, customers] = await Promise.all([
    asUser<{ id: string; name: string }>(
      profileId,
      `select s.seller_id as id, max(coalesce(p.display_name, p.username, s.seller_name, 'Unknown')) as name
       from merchant.sales s left join merchant.profiles p on p.id = s.seller_id group by 1 order by 2`,
    ),
    asUser<{ customer: string }>(profileId, `select distinct customer from merchant.sales where btrim(coalesce(customer, '')) <> '' order by 1 limit 200`),
  ]);
  return { sellers, customers: customers.map((c) => c.customer) };
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

export interface BuildingRent {
  per_day: number;
  paid_until: string | null;
  paid_until_input: string | null;
  days_left_to_prepay: number;
  minutes_left: number | null;
  payments: { day: string; amount: number }[];
}

/** The building rent, times in UTC. Managers only: employees can't read the books. */
export async function buildingRent(profileId: string): Promise<BuildingRent> {
  const [[rent], payments] = await Promise.all([
    asUser<Omit<BuildingRent, "payments">>(
      profileId,
      `select building_rent_per_day as per_day,
              to_char(rent_paid_until at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as paid_until,
              to_char(rent_paid_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as paid_until_input,
              greatest(floor(extract(epoch from (now() + interval '7 days' - greatest(coalesce(rent_paid_until, now()), now()))) / 86400), 0)::int as days_left_to_prepay,
              floor(extract(epoch from (rent_paid_until - now())) / 60)::int as minutes_left
       from merchant.settings`,
    ),
    asUser<BuildingRent["payments"][number]>(
      profileId,
      `select ${utcDay("entry_date")}::text as day, money_out as amount from merchant.treasury_entries
       where ref_type = 'building_rent' order by entry_date desc limit 3`,
    ),
  ]);
  return { ...rent, payments };
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  in_guild: boolean;
  shares: boolean;
}

/** Staff and who shares the profit, by the same rule as merchant._partners(). */
export function listTeam(profileId: string) {
  return asUser<TeamMember>(
    profileId,
    `select id, coalesce(display_name, username, 'Unknown') as name, role, in_guild,
            in_guild and coalesce(profit_share, role in ('owner', 'manager')) as shares
     from merchant.profiles where role in ('owner', 'manager', 'employee')
     order by array_position(array['owner', 'manager', 'employee']::merchant.app_role[], role), 2`,
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

const inRange = (column: string) => `($1::date is null or ${utcDay(column)} >= $1::date) and ($2::date is null or ${utcDay(column)} <= $2::date)`;

/** Everything the Analytics page shows for a range; either end may stay open. */
export async function analytics(profileId: string, from: string | null, to: string | null): Promise<Analytics> {
  const range = [from, to];
  const [days, items, people, totals, balances, [stock]] = await Promise.all([
    asUser<Analytics["days"][number]>(
      profileId,
      `select day::text, sum(revenue) as revenue, sum(profit) as profit, sum(receipts)::int as receipts
       from (select ${utcDay("sale_date")} as day, net_total as revenue, net_total - cost_total as profit, 1 as receipts
             from merchant.sales where status = 'posted' and ${inRange("sale_date")}
             union all
             select ${utcDay("mint_date")}, amount, amount - cost_total, 0
             from merchant.mints where ${inRange("mint_date")}) x
       group by 1 order by 1`,
      range,
    ),
    asUser<Analytics["items"][number] & { category: string | null }>(
      profileId,
      `select name, category, sum(revenue) as revenue, sum(quantity) as quantity
       from (select l.good_name as name, l.category, l.quantity * l.unit_price as revenue, l.quantity
             from merchant.sale_lines l join merchant.sales s on s.id = l.sale_id
             where s.status = 'posted' and ${inRange("s.sale_date")}
             union all
             select material_name || ' (minted)', 'Minting', amount, quantity
             from merchant.mints where ${inRange("mint_date")}) x
       group by 1, 2 order by 3 desc`,
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
      `select coalesce(sum(money_in) filter (where category not in ('Deposit', 'Other')), 0)
             - coalesce(sum(money_out) filter (where category not in ('Withdrawal', 'Partner payout', 'Other')), 0) as net
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

export type ItemRow = Good & { unit_cost: number | null; cost_error: string | null; on_menu: boolean };

/** Goods with what they cost: the recipe if there is one, otherwise the purchase price. */
export function listItems(profileId: string) {
  return asUser<ItemRow>(
    profileId,
    `select g.id, g.name, g.category, g.sell_price, g.buy_price, g.stock, g.min_stock, g.is_bundle, g.profession, g.craft_yield,
            c.unit_cost, c.cost_error, g.on_menu,
            (select count(*)::int from merchant.recipe_components r where r.good_id = g.id) as parts
     from merchant.goods g left join merchant.good_costs() c on c.good_id = g.id
     where g.active order by g.name`,
  );
}

export const isLow = (item: { stock: number; min_stock: number }) => item.min_stock > 0 && item.stock <= item.min_stock;

export async function partnerWeek(profileId: string, week: string) {
  const [row] = await asUser<{ w: PartnerWeek }>(profileId, `select merchant.partner_week($1::date) as w`, [week]);
  return row.w;
}

/** Per partner in a week: carried in from before, the week's share, and what was paid in it. */
export function partnerLedger(profileId: string, week: string) {
  return asUser<PartnerLedger>(profileId, `select * from merchant.partner_ledger($1::date)`, [week]);
}

export async function partnerOpenWeeks(profileId: string, week: string) {
  const rows = await asUser<{ week: string }>(profileId, `select w::text as week from merchant.partner_open_weeks($1::date) w`, [week]);
  return rows.map((r) => r.week);
}

export interface TreasuryFilter {
  category?: string;
  direction?: string;
  q?: string;
  from?: string | null;
  to?: string | null;
  page?: number;
}

const TREASURY_WHERE = `
  where ($1::text is null or category = $1)
    and ($2::text is null or ($2 = 'in' and money_in > 0) or ($2 = 'out' and money_out > 0))
    and ($3::text is null or description ilike '%' || $3 || '%' or category ilike '%' || $3 || '%')
    and ($4::date is null or ${utcDay("entry_date")} >= $4::date)
    and ($5::date is null or ${utcDay("entry_date")} <= $5::date)`;

const treasuryParams = (f: TreasuryFilter) => [
  f.category || null,
  f.direction === "in" || f.direction === "out" ? f.direction : null,
  f.q?.trim() || null,
  f.from ?? null,
  f.to ?? null,
];

export function treasuryEntries(profileId: string, filter: TreasuryFilter = {}) {
  return asUser<TreasuryRow>(
    profileId,
    `select id, entry_date, category, description, money_in, money_out, ref_type
     from merchant.treasury_entries ${TREASURY_WHERE}
     order by entry_date desc, id desc limit ${PAGE_SIZE} offset $6`,
    [...treasuryParams(filter), (filter.page ?? 0) * PAGE_SIZE],
  );
}

export async function treasuryTotals(profileId: string, filter: TreasuryFilter) {
  const [row] = await asUser<{ entries: number; money_in: number; money_out: number }>(
    profileId,
    `select count(*)::int as entries, coalesce(sum(money_in), 0) as money_in, coalesce(sum(money_out), 0) as money_out
     from merchant.treasury_entries ${TREASURY_WHERE}`,
    treasuryParams(filter),
  );
  return row;
}

export async function treasuryOptions(profileId: string) {
  const [categories, notes] = await Promise.all([
    asUser<{ name: string }>(profileId, `select name from merchant.treasury_categories order by sort_order`),
    asUser<{ description: string }>(profileId, `select distinct description from merchant.treasury_entries where btrim(coalesce(description, '')) <> '' order by 1 limit 200`),
  ]);
  return { categories: categories.map((c) => c.name), notes: notes.map((n) => n.description) };
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
  sell_price: number | null;
  on_menu: boolean;
  stock: number;
  min_stock: number;
}

export const RAW_MATERIALS = "Raw Materials";

export interface ItemCategory {
  id: string;
  name: string;
  is_system: boolean;
  items: number;
}

export function listCategories(profileId: string) {
  return asUser<ItemCategory>(
    profileId,
    `select c.id, c.name, c.is_system,
            (select count(*) from merchant.goods g where g.category = c.name and g.active)::int
            + (select count(*) from merchant.materials m where m.category = c.name and m.active)::int as items
     from merchant.categories c order by c.sort_order, c.name`,
  );
}

export function listMaterials(profileId: string) {
  return asUser<Material>(
    profileId,
    `select id, name, category, buy_price, sell_price, on_menu, stock, min_stock from merchant.materials where active order by category, name`,
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
     where u.active order by u.location, coalesce((substring(u.name from '\\d+'))::int, 2147483647), u.name`,
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
  const [good] = await asUser<Good & { unit_cost: number | null; cost_error: string | null; on_menu: boolean }>(
    profileId,
    `select g.id, g.name, g.category, g.sell_price, g.buy_price, g.stock, g.min_stock, g.is_bundle, g.profession, g.craft_yield,
            c.unit_cost, c.cost_error, g.on_menu
     from merchant.goods g
     left join merchant.good_costs() c on c.good_id = g.id
     where g.id = $1`,
    [id],
  );
  return good ?? null;
}

export function recipeLines(profileId: string, goodId: string) {
  return asUser<{ id: string; name: string; quantity: number; stock: number; unit_cost: number | null }>(
    profileId,
    `select r.id, coalesce(m.name, c.name) as name, r.quantity, coalesce(m.stock, c.stock) as stock,
            coalesce(m.buy_price, k.unit_cost) as unit_cost
     from merchant.recipe_components r
     left join merchant.materials m on m.id = r.material_id
     left join merchant.goods c on c.id = r.component_good_id
     left join merchant.good_costs() k on k.good_id = r.component_good_id
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
  min_stock: number;
  lines: { name: string; quantity: number; stock: number }[];
  max_qty: number;
  limiting: string | null;
}

/** Bundles have a recipe too, but they are taken apart when sold, not crafted. */
export function listRecipes(profileId: string) {
  return asUser<Recipe>(
    profileId,
    `select g.id, g.min_stock, g.name, g.profession, g.stock, g.craft_yield, cap.max_qty, cap.limiting,
            (select string_agg(r.quantity || '× ' || coalesce(m.name, c.name), ', ' order by r.created_at)
             from merchant.recipe_components r
             left join merchant.materials m on m.id = r.material_id
             left join merchant.goods c on c.id = r.component_good_id
             where r.good_id = g.id) as parts,
            (select jsonb_agg(jsonb_build_object('name', coalesce(m.name, c.name), 'quantity', r.quantity, 'stock', coalesce(m.stock, c.stock)) order by r.created_at)
             from merchant.recipe_components r
             left join merchant.materials m on m.id = r.material_id
             left join merchant.goods c on c.id = r.component_good_id
             where r.good_id = g.id) as lines
     from merchant.goods g
     left join merchant.craft_capacity() cap on cap.good_id = g.id
     where g.active and not g.is_bundle
       and exists (select 1 from merchant.recipe_components r where r.good_id = g.id)
     order by g.profession nulls last, g.name`,
  );
}

export interface CraftRequest {
  id: string;
  good_id: string;
  name: string;
  stock: number;
  quantity: number;
  fulfilled: number;
  note: string;
  created_at: string | Date;
  requested_by: string | null;
}

export function listCraftRequests(profileId: string) {
  return asUser<CraftRequest>(
    profileId,
    `select r.id, r.good_id, g.name, g.stock, r.quantity, r.fulfilled, r.note, r.created_at,
            coalesce(p.display_name, p.username) as requested_by
     from merchant.craft_requests r
     join merchant.goods g on g.id = r.good_id
     left join merchant.profiles p on p.id = r.requested_by
     where r.status = 'open' order by r.created_at`,
  );
}

export interface EecItem {
  id: string;
  name: string;
  category: string;
  cost: number;
  price: number;
  weekly_limit: number | null;
}

export function listEecItems(profileId: string) {
  return asUser<EecItem>(profileId, `select id, name, category, cost, price, weekly_limit from merchant.eec_items order by sort_order`);
}

export interface EecOrder {
  id: string;
  customer: string;
  items: string;
  total: number;
  order_date: string | Date;
  fulfilled: boolean;
  paid: boolean;
  cancelled: boolean;
  sale_id: string | null;
  receipt_no: number | null;
}

export async function listEecOrders(profileId: string, filter: { q?: string; status: string; page: number }) {
  const rows = await asUser<EecOrder>(
    profileId,
    `select * from merchant.eec_order_list() r
     where ($2::text is null or r.customer ilike '%' || $2 || '%' or r.items ilike '%' || $2 || '%')
       and case $1 when 'all' then true
                   when 'cancelled' then r.cancelled
                   when 'done' then not r.cancelled and r.fulfilled and r.paid
                   else not r.cancelled and not (r.fulfilled and r.paid) end`,
    [filter.status, filter.q?.trim() || null],
  );
  return { rows: rows.slice(filter.page * PAGE_SIZE, (filter.page + 1) * PAGE_SIZE), total: rows.length };
}

export async function eecOrderStats(profileId: string) {
  const [[stats], customers] = await Promise.all([
    asUser<{ to_fulfil: number; to_collect: number; unpaid: number }>(
      profileId,
      `select count(*) filter (where not fulfilled)::int as to_fulfil,
              count(*) filter (where not paid)::int as to_collect,
              coalesce(sum(total) filter (where not paid), 0) as unpaid
       from merchant.eec_order_list() where not cancelled`,
    ),
    asUser<{ customer: string }>(profileId, `select distinct customer from merchant.eec_orders order by 1 limit 200`),
  ]);
  return { ...stats, customers: customers.map((c) => c.customer) };
}

// Minting -------------------------------------------------------------------------

export interface Mintable {
  id: string;
  name: string;
  mint_rate: number;
  stock: number;
}

export function listMintables(profileId: string) {
  return asUser<Mintable>(
    profileId,
    `select id, name, mint_rate, stock from merchant.materials where active and mint_rate is not null order by name`,
  );
}

export interface MintRow {
  id: string;
  mint_no: number;
  mint_date: string | Date;
  material_name: string;
  quantity: number;
  rate: number;
  amount: number;
  note: string;
  created_at: string | Date;
  minted_by_name: string | null;
  mine: boolean;
}

export async function listMints(profileId: string, page: number) {
  const rows = await asUser<MintRow & { total: number }>(
    profileId,
    `select m.id, m.mint_no, m.mint_date, m.material_name, m.quantity, m.rate, m.amount, m.note, m.created_at,
            coalesce(p.display_name, p.username) as minted_by_name, m.minted_by = merchant_auth.uid() as mine,
            count(*) over ()::int as total
     from merchant.mints m left join merchant.profiles p on p.id = m.minted_by
     order by m.mint_date desc, m.mint_no desc limit $1 offset $2`,
    [PAGE_SIZE, page * PAGE_SIZE],
  );
  return { rows, total: rows[0]?.total ?? 0 };
}

/** Septims, ingots and the ingots' cost for the week starting on `week`. */
export async function mintWeek(profileId: string, week: string) {
  const [row] = await asUser<{ amount: number; quantity: number; cost: number }>(
    profileId,
    `select coalesce(sum(amount), 0) as amount, coalesce(sum(quantity), 0) as quantity, coalesce(sum(cost_total), 0) as cost
     from merchant.mints where ${utcDay("mint_date")} >= $1::date and ${utcDay("mint_date")} < $1::date + 7`,
    [week],
  );
  return row;
}

/** Today's mintings, which count toward revenue and profit like sales. */
export async function mintToday(profileId: string) {
  const [row] = await asUser<{ amount: number; cost: number }>(
    profileId,
    `select coalesce(sum(amount), 0) as amount, coalesce(sum(cost_total), 0) as cost
     from merchant.mints where ${utcDay("mint_date")} = (now() at time zone 'UTC')::date`,
  );
  return row;
}

export function listCrafts(profileId: string) {
  return asUser<{ id: string; good_name: string; quantity: number; created_at: string | Date; created_by_name: string | null }>(
    profileId,
    `select id, good_name, quantity, created_at, created_by_name from merchant.crafts order by created_at desc limit 20`,
  );
}
