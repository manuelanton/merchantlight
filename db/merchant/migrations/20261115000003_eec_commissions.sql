-- Merchantlight — commissions: customers order what only the EEC sells, the store buys it for them.
-- Staff take the orders down in the backoffice. eec_items is the buyable list from the Tailor License
-- sheet: `cost` is the base import cost, `price` what the customer pays, set by managers.
-- An order holds several items, each with its amount, name and price as ordered. It is ticked off
-- twice: fulfilled when the customer has it, paid when the gold came in, which posts a receipt.

create table merchant.eec_items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (btrim(name) <> ''),
  category     text not null,
  cost         double precision not null check (cost >= 0),
  price        double precision not null default 0 check (price >= 0),
  weekly_limit int check (weekly_limit > 0),
  sort_order   int not null default 0
);

create table merchant.eec_orders (
  id           uuid primary key default gen_random_uuid(),
  order_no     bigint generated always as identity unique,
  customer     text not null check (btrim(customer) <> ''),
  order_date   timestamptz not null default now(),
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  sale_id      uuid references merchant.sales (id) on delete set null,
  created_by   uuid references merchant.profiles (id) on delete set null
);
create index eec_orders_date_idx on merchant.eec_orders (order_date desc);

create table merchant.eec_order_lines (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null references merchant.eec_orders (id) on delete cascade,
  item_id   uuid references merchant.eec_items (id) on delete set null,
  item_name text not null,
  category  text not null,
  quantity  int not null check (quantity > 0),
  price     double precision not null,
  cost      double precision not null
);
create index eec_order_lines_order_idx on merchant.eec_order_lines (order_id);
create index eec_order_lines_item_idx on merchant.eec_order_lines (item_id);

alter table merchant.eec_items enable row level security;
alter table merchant.eec_orders enable row level security;
alter table merchant.eec_order_lines enable row level security;
grant select on merchant.eec_items, merchant.eec_orders, merchant.eec_order_lines to merchant_app;
grant update (cost, price) on merchant.eec_items to merchant_app;
create policy eec_items_select on merchant.eec_items for select to merchant_app using ((select merchant.is_staff()));
create policy eec_items_update on merchant.eec_items for update to merchant_app
  using ((select merchant.is_manager())) with check ((select merchant.is_manager()));
create policy eec_orders_select on merchant.eec_orders for select to merchant_app using ((select merchant.is_staff()));
create policy eec_order_lines_select on merchant.eec_order_lines for select to merchant_app using ((select merchant.is_staff()));

-- A receipt line for an EEC item has no good or material behind it and takes nothing from stock.
-- `eec_cost` marks it and keeps what the store paid.
alter table merchant.sale_lines add column eec_cost double precision;

create or replace function merchant._sale_line_cost(p_line merchant.sale_lines) returns double precision
language sql stable set search_path = '' as $$
  select case when p_line.eec_cost is not null then p_line.eec_cost
              when p_line.material_id is not null
              then coalesce((select buy_price from merchant.materials where id = p_line.material_id), 0)
              else greatest(merchant._good_unit_cost(p_line.good_id)
                            - merchant._provided_cost(p_line.provided) / nullif(p_line.quantity, 0), 0) end
$$;

create or replace function merchant.post_sale(p_sale uuid)
returns merchant.sales
language plpgsql security definer set search_path = '' as $$
declare
  s        merchant.sales;
  v_sub    double precision;
  v_net    double precision;
  v_cost   double precision;
  r        record;
  v_comm   double precision;
  v_label  text;
begin
  select * into s from merchant.sales where id = p_sale for update;
  if not found then raise exception 'Receipt not found'; end if;
  perform merchant._require(merchant._can_edit_sale(s), 'posting this receipt');
  if s.status <> 'draft' then raise exception 'Receipt #% is already posted', s.receipt_no; end if;
  if not exists (select 1 from merchant.sale_lines where sale_id = p_sale) then
    raise exception 'Receipt #% has no lines', s.receipt_no using errcode = 'P0001';
  end if;
  if exists (select 1 from merchant.sale_lines where sale_id = p_sale and good_id is null and material_id is null and eec_cost is null) then
    raise exception 'Receipt #% references a deleted item', s.receipt_no using errcode = 'P0001';
  end if;

  select sum(quantity * unit_price) into v_sub from merchant.sale_lines where sale_id = p_sale;
  if s.discount > v_sub + 1e-9 then
    raise exception 'Discount (%) exceeds subtotal (%)', s.discount, v_sub using errcode = 'P0001';
  end if;
  v_net := round((v_sub - s.discount)::numeric, 2)::double precision;
  v_label := format('Receipt #%s', s.receipt_no);
  select * into r from merchant._payout_rule(s.created_at);

  update merchant.sale_lines l set unit_cost = merchant._sale_line_cost(l) where l.sale_id = p_sale;
  select coalesce(sum(quantity * unit_cost), 0) into v_cost from merchant.sale_lines where sale_id = p_sale;

  -- Payout per line (discount spread over the lines by value), credited to whoever crafted it.
  update merchant.sale_lines l
  set payout = merchant._line_payout(
                 case when v_sub > 0 then l.quantity * l.unit_price * v_net / v_sub else 0 end,
                 l.quantity * l.unit_cost, r.company_share, r.employee_share)
  where l.sale_id = p_sale;
  select coalesce(sum(payout), 0) into v_comm from merchant.sale_lines where sale_id = p_sale;

  perform merchant._execute_plan(merchant._sale_plan(p_sale), 'Sale', v_label, 'sale', p_sale);

  perform merchant._book('Sales income', v_net, 0,
    v_label || coalesce(' — ' || nullif(btrim(s.customer), ''), ''), 'sale', p_sale, null, s.sale_date);

  update merchant.sales set
    status = 'posted', subtotal = v_sub, net_total = v_net, cost_total = v_cost,
    company_share = r.company_share, employee_share = r.employee_share, commission_amount = v_comm,
    posted_at = now(), posted_by = merchant_auth.uid()
  where id = p_sale
  returning * into s;
  return s;
end $$;

-- p_lines: [{ "item": uuid, "qty": int }]
create function merchant.create_eec_order(p_customer text, p_lines jsonb) returns merchant.eec_orders
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_customer, ''));
  v_item merchant.eec_items;
  v_line record;
  o merchant.eec_orders;
begin
  perform merchant._require(merchant.is_staff(), 'taking a commission');
  if v_name = '' then raise exception 'Give the customer''s name' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'Add at least one item' using errcode = 'P0001'; end if;

  insert into merchant.eec_orders (customer, created_by) values (v_name, merchant_auth.uid()) returning * into o;

  for v_line in
    select (e->>'item')::uuid as item, sum((e->>'qty')::int)::int as qty
    from jsonb_array_elements(p_lines) e group by 1
  loop
    if v_line.qty <= 0 then raise exception 'The amount must be above zero' using errcode = 'P0001'; end if;
    select * into v_item from merchant.eec_items where id = v_line.item for update;
    if not found then raise exception 'Pick an item from the list' using errcode = 'P0001'; end if;
    if v_item.weekly_limit is not null and v_line.qty + coalesce((
      select sum(l.quantity) from merchant.eec_order_lines l
      join merchant.eec_orders x on x.id = l.order_id
      where l.item_id = v_item.id and x.cancelled_at is null
        and x.order_date >= date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'
    ), 0) > v_item.weekly_limit then
      raise exception 'The EEC only sells % % a week', v_item.weekly_limit, v_item.name using errcode = 'P0001';
    end if;
    insert into merchant.eec_order_lines (order_id, item_id, item_name, category, quantity, price, cost)
    values (o.id, v_item.id, v_item.name, v_item.category, v_line.qty, v_item.price, v_item.cost);
  end loop;
  return o;
end $$;

create function merchant.set_eec_fulfilled(p_id uuid, p_done boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform merchant._require(merchant.is_staff(), 'changing a commission');
  update merchant.eec_orders set fulfilled_at = case when p_done then coalesce(fulfilled_at, now()) end
  where id = p_id and cancelled_at is null;
  if not found then raise exception 'This order is cancelled' using errcode = 'P0001'; end if;
end $$;

-- Paid posts a receipt for the order, unticking takes it out of the books again.
create function merchant.set_eec_paid(p_id uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o merchant.eec_orders;
  v_sale uuid;
begin
  perform merchant._require(merchant.is_staff(), 'changing a commission');
  select * into o from merchant.eec_orders where id = p_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0001'; end if;
  if o.cancelled_at is not null then raise exception 'This order is cancelled' using errcode = 'P0001'; end if;

  if not p_paid then
    delete from merchant.sales where id = o.sale_id;
    return;
  end if;

  v_sale := o.sale_id;
  if v_sale is null then
    insert into merchant.sales (seller_id, customer, notes)
    values (merchant_auth.uid(), o.customer, format('EEC commission #%s', o.order_no))
    returning id into v_sale;
    insert into merchant.sale_lines (sale_id, good_name, category, quantity, unit_price, eec_cost)
    select v_sale, l.item_name, l.category, l.quantity, l.price, l.cost
    from merchant.eec_order_lines l where l.order_id = p_id;
    update merchant.eec_orders set sale_id = v_sale where id = p_id;
  end if;
  if (select status::text from merchant.sales where id = v_sale) = 'draft' then
    perform merchant.post_sale(v_sale);
  end if;
end $$;

create function merchant.set_eec_cancelled(p_id uuid, p_cancelled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform merchant._require(merchant.is_staff(), 'changing a commission');
  if p_cancelled then
    if exists (select 1 from merchant.eec_orders o join merchant.sales s on s.id = o.sale_id where o.id = p_id and s.status = 'posted') then
      raise exception 'This order is paid, untick Paid first' using errcode = 'P0001';
    end if;
    delete from merchant.sales where id = (select sale_id from merchant.eec_orders where id = p_id);
  end if;
  update merchant.eec_orders set cancelled_at = case when p_cancelled then now() end where id = p_id;
  if not found then raise exception 'Order not found' using errcode = 'P0001'; end if;
end $$;

-- Paid comes from the receipt, which employees may not see when someone else took the money.
create function merchant.eec_order_list()
returns table (id uuid, customer text, order_date timestamptz, fulfilled boolean, paid boolean, cancelled boolean,
               sale_id uuid, receipt_no bigint, items text, total double precision)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform merchant._require(merchant.is_staff(), 'the commissions');
  return query
  select o.id, o.customer, o.order_date, o.fulfilled_at is not null, coalesce(s.status::text = 'posted', false),
         o.cancelled_at is not null, o.sale_id, s.receipt_no::bigint, l.items, l.total
  from merchant.eec_orders o
  left join merchant.sales s on s.id = o.sale_id
  left join lateral (
    select string_agg(x.quantity || '× ' || x.item_name, ', ' order by x.item_name) as items, sum(x.quantity * x.price) as total
    from merchant.eec_order_lines x where x.order_id = o.id
  ) l on true
  order by o.order_date desc;
end $$;

revoke execute on function merchant.create_eec_order(text, jsonb), merchant.set_eec_fulfilled(uuid, boolean),
  merchant.set_eec_paid(uuid, boolean), merchant.set_eec_cancelled(uuid, boolean), merchant.eec_order_list() from public;
grant execute on function merchant.create_eec_order(text, jsonb), merchant.set_eec_fulfilled(uuid, boolean),
  merchant.set_eec_paid(uuid, boolean), merchant.set_eec_cancelled(uuid, boolean), merchant.eec_order_list() to merchant_app;

-- Sold at import cost until the managers set their prices.
insert into merchant.eec_items (name, category, cost, weekly_limit, sort_order) values
  ('Wedding Dress', 'Clothing', 2000, null, 1),
  ('Wedding Wreath', 'Clothing', 200, null, 2),
  ('Wedding Sandals', 'Clothing', 200, null, 3),
  ('Telvanni Robes', 'Clothing', 2000, null, 4),
  ('Telvanni Shoes', 'Clothing', 200, null, 5),
  ('Chef''s Tunic', 'Clothing', 200, null, 6),
  ('Chef''s Hat', 'Clothing', 20, null, 7),
  ('Fur-lined Boots', 'Clothing', 200, null, 8),
  ('Ulfric''s Clothes (Replica)', 'Clothing', 2000, null, 9),
  ('Ulfric''s Boots (Replica)', 'Clothing', 200, null, 10),
  ('Ulfric''s Bracers (Replica)', 'Clothing', 200, null, 11),
  ('Jester''s Hat', 'Clothing', 100, null, 12),
  ('Jester''s Clothes', 'Clothing', 1000, null, 13),
  ('Jester''s Gloves', 'Clothing', 100, null, 14),
  ('Jester''s Boots', 'Clothing', 100, null, 15),
  ('Skaal Boots', 'Clothing', 100, null, 16),
  ('Skaal Coat', 'Clothing', 1000, null, 17),
  ('Skaal Gloves', 'Clothing', 100, null, 18),
  ('Skaal Hat', 'Clothing', 100, null, 19),
  ('Noble Clothes', 'Clothing', 6000, null, 20),
  ('Fur-trimmed Cloak', 'Clothing', 2000, null, 21),
  ('Fine Raiment', 'Clothing', 7000, null, 22),
  ('Refined Tunic', 'Clothing', 4000, null, 23),
  ('Embroidered Garment', 'Clothing', 8000, null, 24),
  ('Embellished Robes', 'Clothing', 4000, null, 25),
  ('Torturer''s Hood', 'Clothing', 200, null, 26),
  ('Mourners Hat', 'Clothing', 4000, null, 27),
  ('Focusing Gloves', 'Clothing', 800, null, 28),
  ('Hand Wraps', 'Clothing', 200, null, 29),
  ('Pleated Shoes', 'Clothing', 200, null, 30),
  ('Cuffed Boots', 'Clothing', 200, null, 31),
  ('Gothic Style (Vampire) Clothes set', 'Clothing', 6000, null, 32),
  ('Exquisite Gothic Style (Royal Vampire) Clothes set', 'Clothing', 8000, null, 33),
  ('Nocturnal Robes', 'Clothing', 30000, null, 34),
  ('Bone Hawk Amulet (Replica)', 'Clothing', 800, null, 35),
  ('Bone Hawk Ring (Replica)', 'Clothing', 800, null, 36),
  ('Anequina Sunset Moon Monk Robes', 'Moon Monk Robes', 2000, null, 37),
  ('Armored Anequina Sunset Moon Monk Robes', 'Moon Monk Robes', 8000, null, 38),
  ('Assassin Moon Monk Robes', 'Moon Monk Robes', 2000, null, 39),
  ('Armored Assassin Moon Monk Robes', 'Moon Monk Robes', 8000, null, 40),
  ('Khenarthi''s Breath Moon Monk Robes', 'Moon Monk Robes', 2000, null, 41),
  ('Armored Khenarthi''s Breath Moon Monk Robes', 'Moon Monk Robes', 8000, null, 42),
  ('Nahfahlaar''s Flame Moon Monk Robes', 'Moon Monk Robes', 2000, null, 43),
  ('Armored Nahfahlaar''s Flame Moon Monk Robes', 'Moon Monk Robes', 8000, null, 44),
  ('Rahjin''s Shadow Moon Monk Robes', 'Moon Monk Robes', 2000, null, 45),
  ('Armored Rahjin''s Shadow Moon Monk Robes', 'Moon Monk Robes', 8000, null, 46),
  ('Ra''Kazra''s Might Moon Monk Robes', 'Moon Monk Robes', 2000, null, 47),
  ('Armored Ra''Kazra''s Might Moon Monk Robes', 'Moon Monk Robes', 8000, null, 48),
  ('Regal Moon Monk Robes', 'Moon Monk Robes', 2000, null, 49),
  ('Armored Regal Moon Monk Robes', 'Moon Monk Robes', 8000, null, 50),
  ('Water Clan Moon Monk Robes', 'Moon Monk Robes', 2000, null, 51),
  ('Armored Water Clan Moon Monk Robes', 'Moon Monk Robes', 8000, null, 52),
  ('Moon Monk Robes', 'Moon Monk Robes', 2000, null, 53),
  ('Armored Moon Monk Robes', 'Moon Monk Robes', 8000, null, 54),
  ('Linen Wraps', 'Crafting Materials', 250, 10, 55),
  ('Garnet', 'Gems', 60, null, 56),
  ('Garnet (Flawless)', 'Gems', 400, null, 57),
  ('Amethyst', 'Gems', 480, null, 58),
  ('Amethyst (Flawless)', 'Gems', 720, null, 59),
  ('Ruby', 'Gems', 100, null, 60),
  ('Ruby (Flawless)', 'Gems', 1400, null, 61),
  ('Sapphire', 'Gems', 1600, null, 62),
  ('Sapphire (Flawless)', 'Gems', 2000, null, 63),
  ('Sapphire (Exquisite)', 'Gems', 20000, null, 64),
  ('Emerald', 'Gems', 800, null, 65),
  ('Emerald (Flawless)', 'Gems', 2200, null, 66),
  ('Diamond', 'Gems', 3200, null, 67),
  ('Diamond (Flawless)', 'Gems', 4000, null, 68),
  ('Small Pearl', 'Gems', 3200, null, 69),
  ('Pearl', 'Gems', 4000, null, 70),
  ('Amulet of Akatosh', 'Amulets of the Divines', 1000, null, 71),
  ('Amulet of Arkay', 'Amulets of the Divines', 1000, null, 72),
  ('Amulet of Dibella', 'Amulets of the Divines', 1000, null, 73),
  ('Mark of Dibella', 'Amulets of the Divines', 1600, null, 74),
  ('Amulet of Julianos', 'Amulets of the Divines', 1000, null, 75),
  ('Amulet of Kynareth', 'Amulets of the Divines', 1000, null, 76),
  ('Amulet of Mara', 'Amulets of the Divines', 1000, null, 77),
  ('Amulet of Stendarr', 'Amulets of the Divines', 1000, null, 78),
  ('Amulet of Zenithar', 'Amulets of the Divines', 1000, null, 79);
update merchant.eec_items set price = cost;
