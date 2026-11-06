-- Customer orders with stock reservation (2026-09-25).
--
-- An open order reserves what it needs: finished goods already in stock, and for
-- the rest the recipe materials (one level deep, like crafting). Reservations are
-- stored per order and only exist while the order is open.
--
-- Everything that plans consumption (craft, sale posting, can-craft) now uses
-- AVAILABLE stock = stock − reservations of open orders. Work done FOR an order
-- sets the transaction-local setting `merchant.order_ctx`, so that order's own
-- reservations count as available to it.
--
-- Flow: create_order → (craft with p_order …) → deliver_order (creates + posts the
-- receipt, releases the reservation). Deleting that receipt reopens the order.

create type merchant.order_status as enum ('open', 'delivered', 'cancelled');

create table merchant.orders (
  id              uuid primary key default gen_random_uuid(),
  order_no        bigint generated always as identity unique,
  customer        text not null check (btrim(customer) <> ''),
  contact         text,
  due_date        date,
  notes           text,
  status          merchant.order_status not null default 'open',
  sale_id         uuid references merchant.sales (id) on delete set null,
  created_by      uuid references merchant.profiles (id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz,
  cancelled_at    timestamptz
);
create index orders_status_idx on merchant.orders (status, created_at desc);

create table merchant.order_lines (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references merchant.orders (id) on delete cascade,
  good_id    uuid not null references merchant.goods (id) on delete restrict,
  good_name  text not null,
  quantity   double precision not null check (quantity > 0),
  unit_price double precision not null check (unit_price >= 0),
  sort       int not null default 0
);
create index order_lines_order_idx on merchant.order_lines (order_id);

create table merchant.order_reservations (
  id        bigint generated always as identity primary key,
  order_id  uuid not null references merchant.orders (id) on delete cascade,
  item_kind text not null check (item_kind in ('material', 'good')),
  item_id   uuid not null,
  quantity  double precision not null check (quantity > 0),
  unique (order_id, item_kind, item_id)
);
create index order_reservations_item_idx on merchant.order_reservations (item_kind, item_id);

alter table merchant.crafts add column order_id uuid references merchant.orders (id) on delete set null;

-- Availability ---------------------------------------------------------------

create function merchant._order_ctx() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('merchant.order_ctx', true), '')::uuid
$$;

create function merchant._reserved(p_kind text, p_id uuid) returns double precision
language sql stable set search_path = '' as $$
  select coalesce(sum(r.quantity), 0)
  from merchant.order_reservations r
  join merchant.orders o on o.id = r.order_id and o.status = 'open'
  where r.item_kind = p_kind and r.item_id = p_id
    and r.order_id is distinct from merchant._order_ctx()
$$;

create function merchant._available(p_kind text, p_id uuid) returns double precision
language sql stable set search_path = '' as $$
  select coalesce(case when p_kind = 'material'
                       then (select stock from merchant.materials where id = p_id)
                       else (select stock from merchant.goods where id = p_id) end, 0)
       - merchant._reserved(p_kind, p_id)
$$;

-- Planner now works on available stock (bodies otherwise unchanged).
create or replace function merchant._craft_plan(p_good uuid, p_qty double precision)
returns table (kind text, item_id uuid, qty double precision)
language sql stable set search_path = '' as $$
  with direct as (
    select rc.material_id, rc.component_good_id, rc.quantity * p_qty as need
    from merchant.recipe_components rc
    where rc.good_id = p_good
  ), sub as (
    select d.component_good_id as gid, d.need,
           merchant._available('good', d.component_good_id) >= d.need - 1e-9 as from_stock,
           exists (select 1 from merchant.recipe_components r where r.good_id = d.component_good_id) as has_recipe
    from direct d
    where d.component_good_id is not null
  ), cons as (
    select 'material'::text as kind, d.material_id as item_id, d.need as qty
    from direct d where d.material_id is not null
    union all
    select 'good', s.gid, s.need from sub s where s.from_stock or not s.has_recipe
    union all
    select case when rc.material_id is not null then 'material' else 'good' end,
           coalesce(rc.material_id, rc.component_good_id), rc.quantity * s.need
    from sub s
    join merchant.recipe_components rc on rc.good_id = s.gid
    where not s.from_stock and s.has_recipe
  )
  select c.kind, c.item_id, sum(c.qty) from cons c group by c.kind, c.item_id
$$;

create or replace function merchant._resolve_consumption(p_items jsonb, p_prefer_stock boolean)
returns jsonb
language sql stable set search_path = '' as $$
  with items as (
    select (e ->> 'good_id')::uuid as good_id, sum((e ->> 'qty')::double precision) as q
    from jsonb_array_elements(p_items) e
    group by 1
  ), decided as (
    select i.good_id, i.q,
           p_prefer_stock and merchant._available('good', i.good_id) >= i.q - 1e-9 as from_stock,
           exists (select 1 from merchant.recipe_components rc where rc.good_id = i.good_id) as has_recipe
    from items i
  ), cons as (
    select 'good'::text as kind, d.good_id as item_id, d.q as qty
    from decided d where d.from_stock or not d.has_recipe
    union all
    select p.kind, p.item_id, p.qty
    from decided d
    cross join lateral merchant._craft_plan(d.good_id, d.q) p
    where not d.from_stock and d.has_recipe
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'item_id', s.item_id, 'qty', s.qty)), '[]'::jsonb)
  from (select c.kind, c.item_id, sum(c.qty) as qty from cons c group by c.kind, c.item_id) s
$$;

create or replace function merchant._plan_details(p_plan jsonb)
returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', x.kind,
           'item_id', x.item_id,
           'name', coalesce(m.name, g.name),
           'unit', coalesce(m.unit, 'pc'),
           'qty', x.qty,
           'available', a.available,
           'reserved', a.reserved,
           'missing', case when x.qty - a.available > 1e-9 then x.qty - a.available else 0 end)
         order by x.kind desc, coalesce(m.name, g.name)), '[]'::jsonb)
  from jsonb_to_recordset(p_plan) as x (kind text, item_id uuid, qty double precision)
  left join merchant.materials m on x.kind = 'material' and m.id = x.item_id
  left join merchant.goods g on x.kind = 'good' and g.id = x.item_id
  cross join lateral (select merchant._available(x.kind, x.item_id) as available,
                             merchant._reserved(x.kind, x.item_id) as reserved) a
$$;

create or replace function merchant._missing_text(p_details jsonb) returns text
language sql immutable set search_path = '' as $$
  select string_agg(format('%s (need %s, available %s, missing %s%s)',
           e ->> 'name',
           trim_scale(round((e ->> 'qty')::numeric, 3)),
           trim_scale(round(greatest((e ->> 'available')::numeric, 0), 3)),
           trim_scale(round((e ->> 'missing')::numeric, 3)),
           case when coalesce((e ->> 'reserved')::numeric, 0) > 0
                then format('; %s reserved for orders', trim_scale(round((e ->> 'reserved')::numeric, 3)))
                else '' end), '; ')
  from jsonb_array_elements(p_details) e
  where (e ->> 'missing')::double precision > 0
$$;

-- Reservation of one order ------------------------------------------------------
-- Goods already available are reserved as goods (partially if needed); the rest
-- is reserved as recipe materials. Idempotent: rebuilds from the current state.
create function merchant._reserve_order(p_order uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_prev text := current_setting('merchant.order_ctx', true);
begin
  delete from merchant.order_reservations where order_id = p_order;
  if (select status from merchant.orders where id = p_order) <> 'open' then return; end if;
  perform set_config('merchant.order_ctx', p_order::text, true);

  insert into merchant.order_reservations (order_id, item_kind, item_id, quantity)
  select p_order, x.kind, x.item_id, sum(x.qty)
  from (
    with l as (
      select good_id, sum(quantity) as q from merchant.order_lines where order_id = p_order group by good_id
    ), d as (
      select l.good_id, l.q,
             least(greatest(merchant._available('good', l.good_id), 0), l.q) as take,
             exists (select 1 from merchant.recipe_components rc where rc.good_id = l.good_id) as has_recipe
      from l
    )
    select 'good'::text as kind, d.good_id as item_id, d.take as qty from d where d.take > 1e-9
    union all
    select 'good', d.good_id, d.q - d.take from d where d.q - d.take > 1e-9 and not d.has_recipe
    union all
    select p.kind, p.item_id, p.qty
    from d cross join lateral merchant._craft_plan(d.good_id, d.q - d.take) p
    where d.q - d.take > 1e-9 and d.has_recipe
  ) x
  group by x.kind, x.item_id
  having sum(x.qty) > 1e-9;

  perform set_config('merchant.order_ctx', coalesce(v_prev, ''), true);
end $$;

create function merchant._can_edit_order(p_order merchant.orders) returns boolean
language sql stable set search_path = '' as $$
  select merchant.is_manager() or (merchant.is_staff() and p_order.created_by = merchant_auth.uid())
$$;

create function merchant._set_order_lines(p_order uuid, p_lines jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare x record; v_name text; v_price double precision; i int := 0;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'An order needs at least one line' using errcode = 'P0001';
  end if;
  delete from merchant.order_lines where order_id = p_order;
  for x in select * from jsonb_to_recordset(p_lines) as r (good_id uuid, qty double precision, unit_price double precision) loop
    select name, sell_price into v_name, v_price from merchant.goods where id = x.good_id;
    if v_name is null then raise exception 'Good % not found', x.good_id; end if;
    if x.qty is null or x.qty <= 0 then raise exception 'Quantity must be positive' using errcode = 'P0001'; end if;
    i := i + 1;
    insert into merchant.order_lines (order_id, good_id, good_name, quantity, unit_price, sort)
    values (p_order, x.good_id, v_name, x.qty, coalesce(x.unit_price, v_price), i);
  end loop;
end $$;

-- Overview: lines with what is ready, reservations with shortages -----------------
create function merchant.order_overview(p_order uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o merchant.orders; v_res jsonb; v_lines jsonb;
begin
  perform merchant._require(merchant.is_staff(), 'viewing orders');
  select * into o from merchant.orders where id = p_order;
  if not found then raise exception 'Order not found'; end if;
  perform set_config('merchant.order_ctx', p_order::text, true);

  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', r.item_kind, 'item_id', r.item_id, 'name', coalesce(m.name, g.name),
           'unit', coalesce(m.unit, 'pc'), 'qty', r.quantity,
           'available', a.available,
           'missing', greatest(r.quantity - greatest(a.available, 0), 0))
         order by r.item_kind desc, coalesce(m.name, g.name)), '[]'::jsonb)
    into v_res
  from merchant.order_reservations r
  left join merchant.materials m on r.item_kind = 'material' and m.id = r.item_id
  left join merchant.goods g on r.item_kind = 'good' and g.id = r.item_id
  cross join lateral (select merchant._available(r.item_kind, r.item_id) as available) a
  where r.order_id = p_order;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'good_id', l.good_id, 'good_name', l.good_name, 'quantity', l.quantity,
           'unit_price', l.unit_price,
           'ready_qty', least(l.quantity, coalesce((select r.quantity from merchant.order_reservations r
                                                      where r.order_id = p_order and r.item_kind = 'good' and r.item_id = l.good_id), 0)))
         order by l.sort), '[]'::jsonb)
    into v_lines
  from merchant.order_lines l where l.order_id = p_order;

  perform set_config('merchant.order_ctx', '', true);
  return jsonb_build_object(
    'lines', v_lines,
    'reservations', v_res,
    'total', (select coalesce(sum(quantity * unit_price), 0) from merchant.order_lines where order_id = p_order),
    'short', exists (select 1 from jsonb_array_elements(v_res) e where (e ->> 'missing')::double precision > 1e-9),
    'all_crafted', not exists (select 1 from jsonb_array_elements(v_lines) e
                               where (e ->> 'ready_qty')::double precision < (e ->> 'quantity')::double precision - 1e-9));
end $$;

-- One row per open order for the list view.
create function merchant.open_orders_state()
returns table (order_id uuid, short boolean, all_crafted boolean)
language plpgsql security definer set search_path = '' as $$
declare o record; v jsonb;
begin
  perform merchant._require(merchant.is_staff(), 'viewing orders');
  for o in select id from merchant.orders where status = 'open' loop
    v := merchant.order_overview(o.id);
    order_id := o.id; short := (v ->> 'short')::boolean; all_crafted := (v ->> 'all_crafted')::boolean;
    return next;
  end loop;
end $$;

-- RPCs --------------------------------------------------------------------------

create function merchant.create_order(
  p_customer text, p_lines jsonb, p_contact text default null, p_due date default null, p_notes text default null
) returns merchant.orders
language plpgsql security definer set search_path = '' as $$
declare o merchant.orders;
begin
  perform merchant._require(merchant.is_staff(), 'creating orders');
  insert into merchant.orders (customer, contact, due_date, notes, created_by, created_by_name)
  values (btrim(p_customer), nullif(btrim(p_contact), ''), p_due, nullif(btrim(p_notes), ''), merchant_auth.uid(), merchant._actor_name())
  returning * into o;
  perform merchant._set_order_lines(o.id, p_lines);
  perform merchant._reserve_order(o.id);
  return o;
end $$;

create function merchant.set_order_lines(p_order uuid, p_lines jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare o merchant.orders;
begin
  select * into o from merchant.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  perform merchant._require(merchant._can_edit_order(o), 'editing this order');
  if o.status <> 'open' then raise exception 'Order #% is %', o.order_no, o.status; end if;
  perform merchant._set_order_lines(p_order, p_lines);
  perform merchant._reserve_order(p_order);
end $$;

create function merchant.refresh_order_reservation(p_order uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform merchant._require(merchant.is_staff(), 'editing orders');
  perform merchant._reserve_order(p_order);
end $$;

create function merchant.cancel_order(p_order uuid)
returns merchant.orders
language plpgsql security definer set search_path = '' as $$
declare o merchant.orders;
begin
  select * into o from merchant.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  perform merchant._require(merchant._can_edit_order(o), 'cancelling this order');
  if o.status <> 'open' then raise exception 'Order #% is %', o.order_no, o.status; end if;
  update merchant.orders set status = 'cancelled', cancelled_at = now() where id = p_order returning * into o;
  delete from merchant.order_reservations where order_id = p_order;
  return o;
end $$;

-- Creates AND posts the receipt for the order (atomic: fails as a whole on shortage).
create function merchant.deliver_order(
  p_order uuid, p_seller uuid default null, p_discount double precision default 0, p_tip double precision default 0
) returns merchant.sales
language plpgsql security definer set search_path = '' as $$
declare
  o merchant.orders;
  s merchant.sales;
  v_seller uuid := coalesce(p_seller, merchant_auth.uid());
begin
  perform merchant._require(merchant.is_staff(), 'delivering orders');
  select * into o from merchant.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status <> 'open' then raise exception 'Order #% is %', o.order_no, o.status; end if;
  if v_seller <> merchant_auth.uid() and not merchant.is_manager() then
    raise exception 'Not allowed: only the Manager or Owner can deliver in someone else''s name' using errcode = '42501';
  end if;

  -- Release first so the receipt can use what was held for this order.
  delete from merchant.order_reservations where order_id = p_order;

  insert into merchant.sales (seller_id, customer, discount, tip, notes)
  values (v_seller, o.customer, coalesce(p_discount, 0), coalesce(p_tip, 0),
          format('Order #%s', o.order_no) || coalesce(' — ' || o.notes, ''))
  returning * into s;
  insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price)
  select s.id, l.good_id, l.quantity, l.unit_price from merchant.order_lines l where l.order_id = p_order order by l.sort;

  s := merchant.post_sale(s.id);

  update merchant.orders set status = 'delivered', delivered_at = now(), sale_id = s.id where id = p_order;
  return s;
end $$;

-- Craft / preview gain an optional order: its reservation may be used, and afterwards
-- the order is re-reserved (the crafted goods now count for it).
drop function merchant.craft_preview(uuid, double precision);
drop function merchant.craft(uuid, double precision, text);

create function merchant.craft_preview(p_good uuid, p_qty double precision, p_order uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_details jsonb;
begin
  perform merchant._require(merchant.is_staff(), 'crafting');
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be positive'; end if;
  if not exists (select 1 from merchant.recipe_components where good_id = p_good) then
    raise exception 'This good has no recipe' using errcode = 'P0001';
  end if;
  perform set_config('merchant.order_ctx', coalesce(p_order::text, ''), true);
  v_details := merchant._plan_details(merchant._resolve_consumption(
    jsonb_build_array(jsonb_build_object('good_id', p_good, 'qty', p_qty)), false));
  perform set_config('merchant.order_ctx', '', true);
  return jsonb_build_object(
    'good_id', p_good, 'qty', p_qty,
    'ok', merchant._missing_text(v_details) is null,
    'missing_text', merchant._missing_text(v_details),
    'lines', v_details);
end $$;

create function merchant.craft(p_good uuid, p_qty double precision, p_note text default null, p_order uuid default null)
returns merchant.crafts
language plpgsql security definer set search_path = '' as $$
declare
  v_craft merchant.crafts;
  v_name  text;
  v_plan  jsonb;
  v_note  text;
begin
  perform merchant._require(merchant.is_staff(), 'crafting');
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be positive'; end if;
  select name into v_name from merchant.goods where id = p_good for update;
  if not found then raise exception 'Good not found'; end if;
  if not exists (select 1 from merchant.recipe_components where good_id = p_good) then
    raise exception '"%" has no recipe', v_name using errcode = 'P0001';
  end if;
  if p_order is not null and coalesce((select status::text from merchant.orders where id = p_order), '') <> 'open' then
    raise exception 'Order is not open' using errcode = 'P0001';
  end if;

  perform set_config('merchant.order_ctx', coalesce(p_order::text, ''), true);
  v_note := format('Crafted %s × %s', trim_scale(p_qty::numeric), v_name)
    || coalesce(format(' for order #%s', (select order_no from merchant.orders where id = p_order)), '')
    || coalesce(' — ' || p_note, '');

  v_plan := merchant._resolve_consumption(
    jsonb_build_array(jsonb_build_object('good_id', p_good, 'qty', p_qty)), false);

  insert into merchant.crafts (good_id, good_name, quantity, created_by, created_by_name, order_id)
  values (p_good, v_name, p_qty, merchant_auth.uid(), merchant._actor_name(), p_order)
  returning * into v_craft;

  update merchant.crafts
  set consumed = merchant._execute_plan(v_plan, 'Production', v_note, 'craft', v_craft.id)
  where id = v_craft.id
  returning * into v_craft;

  perform merchant._apply_stock('good', p_good, p_qty, 'Production', v_note, 'craft', v_craft.id);
  perform set_config('merchant.order_ctx', '', true);

  if p_order is not null then perform merchant._reserve_order(p_order); end if;
  return v_craft;
end $$;

-- Undoing a craft or deleting a delivered receipt keeps order reservations consistent.
create function merchant._rereserve_after_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_order uuid;
begin
  if tg_table_name = 'sales' then
    update merchant.orders set status = 'open', delivered_at = null, sale_id = null
    where sale_id = old.id and status = 'delivered'
    returning id into v_order;
  else
    v_order := (to_jsonb(old) ->> 'order_id')::uuid;
  end if;
  if v_order is not null then perform merchant._reserve_order(v_order); end if;
  return old;
end $$;

-- Named to sort after the *_reverse triggers (BEFORE triggers fire alphabetically),
-- so stock is already restored when the order is re-reserved.
create trigger sales_z_reopen_order before delete on merchant.sales
  for each row execute function merchant._rereserve_after_delete();
create trigger crafts_z_rereserve before delete on merchant.crafts
  for each row execute function merchant._rereserve_after_delete();

-- Access ------------------------------------------------------------------------
alter table merchant.orders             enable row level security;
alter table merchant.order_lines        enable row level security;
alter table merchant.order_reservations enable row level security;

revoke all on merchant.orders, merchant.order_lines, merchant.order_reservations from merchant_app;
grant select, delete on merchant.orders to merchant_app;
grant update (customer, contact, due_date, notes) on merchant.orders to merchant_app;
grant select on merchant.order_lines, merchant.order_reservations to merchant_app;

create policy orders_select on merchant.orders for select to merchant_app using ((select merchant.is_staff()));
create policy orders_update on merchant.orders for update to merchant_app
  using (status = 'open' and merchant._can_edit_order(orders)) with check (status = 'open' and merchant._can_edit_order(orders));
-- Only finished orders can be deleted (open ones are cancelled first).
create policy orders_delete on merchant.orders for delete to merchant_app
  using ((select merchant.is_manager()) and status <> 'open');
create policy order_lines_select on merchant.order_lines for select to merchant_app using ((select merchant.is_staff()));
create policy order_reservations_select on merchant.order_reservations for select to merchant_app using ((select merchant.is_staff()));

revoke execute on all functions in schema merchant from public, merchant_app;
grant execute on function merchant.my_role(), merchant.is_owner(), merchant.is_manager(),
  merchant.is_staff(), merchant.can_view_materials() to merchant_app;
grant execute on function merchant._can_edit_sale(merchant.sales), merchant._can_edit_order(merchant.orders) to merchant_app;
grant execute on function
  merchant.set_role_override(uuid, merchant.app_role),
  merchant.good_costs(),
  merchant.adjust_stock(text, uuid, double precision, merchant.stock_reason, text),
  merchant.treasury_balance(),
  merchant.craft_preview(uuid, double precision, uuid),
  merchant.craft(uuid, double precision, text, uuid),
  merchant.craft_capacity(),
  merchant.sale_post_preview(uuid),
  merchant.post_sale(uuid),
  merchant.create_purchase(jsonb, text, text, boolean, timestamptz),
  merchant.create_rental(uuid, text, int, date, double precision, text),
  merchant.extend_rental(uuid, int),
  merchant.end_rental(uuid),
  merchant.create_order(text, jsonb, text, date, text),
  merchant.set_order_lines(uuid, jsonb),
  merchant.refresh_order_reservation(uuid),
  merchant.cancel_order(uuid),
  merchant.deliver_order(uuid, uuid, double precision, double precision),
  merchant.order_overview(uuid),
  merchant.open_orders_state()
to merchant_app;

