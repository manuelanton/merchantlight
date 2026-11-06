-- 2026-10-05 (team request):
-- 1. "Customer brings materials": a receipt line / commission piece can record materials the
--    customer provided (provided = [{kind, item_id, qty}]). Such a piece is crafted fresh from its
--    recipe; the provided amounts are NOT taken from stock and NOT counted as material cost.
--    (The price reduction is applied to unit_price by the app, which shows it before saving.)
-- 2. Several employees per commission: each line can name who crafted it (crafted_by). On posting,
--    every line gets its own payout = line sale − line material cost − merchant keep, credited to
--    crafted_by (or the seller). The receipt's commission_amount is the sum of its lines.

alter table merchant.sale_lines add column provided jsonb;
alter table merchant.sale_lines add column crafted_by uuid references merchant.profiles (id) on delete set null;
alter table merchant.sale_lines add column payout double precision;
grant insert (provided, crafted_by), update (provided, crafted_by) on merchant.sale_lines to merchant_app;

alter table merchant.order_lines add column provided jsonb;
alter table merchant.order_lines add column crafted_by uuid references merchant.profiles (id) on delete set null;

-- Helpers -------------------------------------------------------------------------

-- Cost value of provided items (materials at buy price, crafted items at recipe cost).
create function merchant._provided_cost(p_provided jsonb) returns double precision
language sql stable set search_path = '' as $$
  select coalesce(sum(p.qty * case when p.kind = 'material'
                                   then coalesce((select buy_price from merchant.materials where id = p.item_id), 0)
                                   else merchant._good_unit_cost(p.item_id) end), 0)
  from jsonb_to_recordset(coalesce(p_provided, '[]'::jsonb)) as p (kind text, item_id uuid, qty double precision)
  where p.qty > 0
$$;

-- What one piece takes from stock: crafted fresh from its recipe, minus what the customer brought.
create function merchant._line_plan_minus_provided(p_good uuid, p_qty double precision, p_provided jsonb)
returns table (kind text, item_id uuid, qty double precision)
language sql stable set search_path = '' as $$
  select x.kind, x.item_id,
         case when x.qty > 0 then greatest(x.qty - coalesce(pv.qty, 0), 0) else x.qty end
  from jsonb_to_recordset(merchant._resolve_consumption(
         jsonb_build_array(jsonb_build_object('good_id', p_good, 'qty', p_qty)), false))
       as x (kind text, item_id uuid, qty double precision)
  left join (
    select p.kind, p.item_id, sum(p.qty) as qty
    from jsonb_to_recordset(coalesce(p_provided, '[]'::jsonb)) as p (kind text, item_id uuid, qty double precision)
    group by 1, 2
  ) pv on pv.kind = x.kind and pv.item_id = x.item_id
$$;

create function merchant._has_provided(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p) = 'array' and jsonb_array_length(p) > 0, false)
$$;

-- Receipts ------------------------------------------------------------------------

create or replace function merchant._sale_plan(p_sale uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'item_id', s.item_id, 'qty', s.qty)), '[]'::jsonb)
  from (
    select a.kind, a.item_id, sum(a.qty) as qty
    from (
      -- normal goods lines: stock first, rest crafted on the spot
      select x.kind, x.item_id, x.qty
      from jsonb_to_recordset(merchant._resolve_consumption(
             (select coalesce(jsonb_agg(jsonb_build_object('good_id', good_id, 'qty', quantity)), '[]'::jsonb)
              from merchant.sale_lines where sale_id = p_sale and good_id is not null and not merchant._has_provided(provided)), true))
           as x (kind text, item_id uuid, qty double precision)
      union all
      -- pieces with customer materials: crafted fresh, minus what was brought
      select p.kind, p.item_id, p.qty
      from merchant.sale_lines l
      cross join lateral merchant._line_plan_minus_provided(l.good_id, l.quantity, l.provided) p
      where l.sale_id = p_sale and l.good_id is not null and merchant._has_provided(l.provided)
      union all
      select 'material', material_id, quantity from merchant.sale_lines where sale_id = p_sale and material_id is not null
    ) a
    group by a.kind, a.item_id
    having abs(sum(a.qty)) > 1e-9
  ) s
$$;

create or replace function merchant._sale_line_cost(p_line merchant.sale_lines) returns double precision
language sql stable set search_path = '' as $$
  select case when p_line.material_id is not null
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
  v_share  double precision;
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
  if exists (select 1 from merchant.sale_lines where sale_id = p_sale and good_id is null and material_id is null) then
    raise exception 'Receipt #% references a deleted item', s.receipt_no using errcode = 'P0001';
  end if;

  select sum(quantity * unit_price) into v_sub from merchant.sale_lines where sale_id = p_sale;
  if s.discount > v_sub + 1e-9 then
    raise exception 'Discount (%) exceeds subtotal (%)', s.discount, v_sub using errcode = 'P0001';
  end if;
  v_net := round((v_sub - s.discount)::numeric, 2)::double precision;
  v_label := format('Receipt #%s', s.receipt_no);
  select company_share into v_share from merchant.settings;

  update merchant.sale_lines l set unit_cost = merchant._sale_line_cost(l) where l.sale_id = p_sale;
  select coalesce(sum(quantity * unit_cost), 0) into v_cost from merchant.sale_lines where sale_id = p_sale;

  -- Payout per line (discount spread over the lines by value), credited to whoever crafted it.
  update merchant.sale_lines l
  set payout = merchant._employee_commission(
                 case when v_sub > 0 then l.quantity * l.unit_price * v_net / v_sub else 0 end,
                 l.quantity * l.unit_cost, v_share)
  where l.sale_id = p_sale;
  select coalesce(sum(payout), 0) into v_comm from merchant.sale_lines where sale_id = p_sale;

  perform merchant._execute_plan(merchant._sale_plan(p_sale), 'Sale', v_label, 'sale', p_sale);

  perform merchant._book('Sales income', v_net, 0,
    v_label || coalesce(' — ' || nullif(btrim(s.customer), ''), ''), 'sale', p_sale, null, s.sale_date);

  update merchant.sales set
    status = 'posted', subtotal = v_sub, net_total = v_net, cost_total = v_cost,
    company_share = v_share, commission_amount = v_comm,
    posted_at = now(), posted_by = merchant_auth.uid()
  where id = p_sale
  returning * into s;
  return s;
end $$;

-- Reopening clears the line payouts too.
create or replace function merchant.unpost_sale(p_sale uuid)
returns merchant.sales
language plpgsql security definer set search_path = '' as $$
declare s merchant.sales;
begin
  select * into s from merchant.sales where id = p_sale for update;
  if not found then raise exception 'Receipt not found'; end if;
  perform merchant._require(merchant._can_edit_sale(s), 'editing this receipt');
  if s.status <> 'posted' then raise exception 'Receipt #% is not posted', s.receipt_no; end if;

  perform merchant._reverse_ref('sale', p_sale, format('Receipt #%s reopened for editing', s.receipt_no));
  update merchant.sale_lines set unit_cost = null, payout = null where sale_id = p_sale;
  update merchant.sales set
    status = 'draft', subtotal = null, net_total = null, cost_total = null,
    company_share = null, commission_amount = null, posted_at = null, posted_by = null
  where id = p_sale
  returning * into s;
  return s;
end $$;

-- Earned per person: line payouts go to the crafter (or the seller); receipts posted before
-- line payouts existed credit their whole commission to the seller.
create or replace function merchant.payout_summary()
returns table (person_id uuid, name text, earned double precision, paid double precision,
               owed double precision, wages double precision, receipts bigint, last_paid_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with credits as (
    select coalesce(l.crafted_by, s.seller_id) as pid, l.payout as amount, s.id as sale_id
    from merchant.sales s join merchant.sale_lines l on l.sale_id = s.id
    where s.status = 'posted' and l.payout is not null
    union all
    select s.seller_id, coalesce(s.commission_amount, 0), s.id
    from merchant.sales s
    where s.status = 'posted'
      and not exists (select 1 from merchant.sale_lines l where l.sale_id = s.id and l.payout is not null)
  ), earned as (
    select pid, sum(amount) as earned, count(distinct sale_id) as receipts from credits group by pid
  ), paid as (
    select beneficiary_id as pid,
           sum(money_out) filter (where category = 'Commission') as paid,
           sum(money_out) filter (where category = 'Wages') as wages,
           max(entry_date) as last_paid_at
    from merchant.treasury_entries
    where beneficiary_id is not null and ref_type = 'payout'
    group by beneficiary_id
  )
  select p.id, coalesce(p.display_name, p.username),
         coalesce(e.earned, 0), coalesce(pd.paid, 0),
         round((coalesce(e.earned, 0) - coalesce(pd.paid, 0))::numeric, 2)::double precision,
         coalesce(pd.wages, 0), coalesce(e.receipts, 0), pd.last_paid_at
  from merchant.profiles p
  left join earned e on e.pid = p.id
  left join paid pd on pd.pid = p.id
  where (e.pid is not null or pd.pid is not null)
    and (merchant.is_manager() or (merchant.is_staff() and p.id = merchant_auth.uid()))
  order by 5 desc, 2
$$;

-- Commissions (orders) ---------------------------------------------------------------

create or replace function merchant._set_order_lines(p_order uuid, p_lines jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare x record; v_name text; v_price double precision; i int := 0;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'An order needs at least one line' using errcode = 'P0001';
  end if;
  delete from merchant.order_lines where order_id = p_order;
  for x in select * from jsonb_to_recordset(p_lines)
             as r (good_id uuid, qty double precision, unit_price double precision, crafted_by uuid, provided jsonb)
  loop
    select name, sell_price into v_name, v_price from merchant.goods where id = x.good_id;
    if v_name is null then raise exception 'Good % not found', x.good_id; end if;
    if x.qty is null or x.qty <= 0 then raise exception 'Quantity must be positive' using errcode = 'P0001'; end if;
    i := i + 1;
    insert into merchant.order_lines (order_id, good_id, good_name, quantity, unit_price, sort, crafted_by, provided)
    values (p_order, x.good_id, v_name, x.qty, coalesce(x.unit_price, v_price), i, x.crafted_by,
            case when merchant._has_provided(x.provided) then x.provided end);
  end loop;
end $$;

-- Any employee can sign up for a piece ("I'll craft this"); managers/the creator can assign anyone.
create function merchant.set_order_line_crafter(p_line uuid, p_employee uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare o merchant.orders;
begin
  perform merchant._require(merchant.is_staff(), 'working on commissions');
  select ord.* into o from merchant.orders ord join merchant.order_lines l on l.order_id = ord.id where l.id = p_line;
  if not found then raise exception 'Commission piece not found'; end if;
  if o.status <> 'open' then raise exception 'Commission #% is %', o.order_no, o.status; end if;
  if p_employee is distinct from merchant_auth.uid() and not merchant._can_edit_order(o) then
    raise exception 'Not allowed: you can only sign yourself up' using errcode = '42501';
  end if;
  update merchant.order_lines set crafted_by = p_employee where id = p_line;
end $$;

-- Customer materials for a piece + the adjusted price (both shown in the app before saving).
create function merchant.set_order_line_provided(p_line uuid, p_provided jsonb, p_unit_price double precision)
returns void
language plpgsql security definer set search_path = '' as $$
declare o merchant.orders;
begin
  select ord.* into o from merchant.orders ord join merchant.order_lines l on l.order_id = ord.id where l.id = p_line;
  if not found then raise exception 'Commission piece not found'; end if;
  perform merchant._require(merchant._can_edit_order(o), 'editing this commission');
  if o.status <> 'open' then raise exception 'Commission #% is %', o.order_no, o.status; end if;
  update merchant.order_lines
  set provided = case when merchant._has_provided(p_provided) then p_provided end,
      unit_price = greatest(coalesce(p_unit_price, unit_price), 0)
  where id = p_line;
end $$;

create or replace function merchant.deliver_order(
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

  delete from merchant.order_reservations where order_id = p_order;

  insert into merchant.sales (seller_id, customer, discount, tip, notes)
  values (v_seller, o.customer, coalesce(p_discount, 0), coalesce(p_tip, 0),
          format('Commission #%s', o.order_no) || coalesce(' — ' || o.notes, ''))
  returning * into s;
  insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price, crafted_by, provided)
  select s.id, l.good_id, l.quantity, l.unit_price, l.crafted_by, l.provided
  from merchant.order_lines l where l.order_id = p_order order by l.sort;

  s := merchant.post_sale(s.id);

  update merchant.orders set status = 'delivered', delivered_at = now(), sale_id = s.id where id = p_order;
  return s;
end $$;

create or replace function merchant._order_needs(p_order uuid)
returns jsonb
language sql stable set search_path = '' as $$
  with l as (
    select good_id, sum(quantity) as q from merchant.order_lines
    where order_id = p_order and not merchant._has_provided(provided) group by good_id
  ), d as (
    select l.good_id, l.q,
           least(greatest((select stock from merchant.goods where id = l.good_id), 0), l.q) as take,
           exists (select 1 from merchant.recipe_components rc where rc.good_id = l.good_id) as has_recipe
    from l
  ), cons as (
    select 'good'::text as kind, d.good_id as item_id, d.take as qty from d where d.take > 1e-9
    union all
    select 'good', d.good_id, d.q - d.take from d where d.q - d.take > 1e-9 and not d.has_recipe
    union all
    select p.kind, p.item_id, p.qty
    from d cross join lateral merchant._craft_plan(d.good_id, d.q - d.take) p
    where d.q - d.take > 1e-9 and d.has_recipe
    union all
    select p.kind, p.item_id, p.qty
    from merchant.order_lines ol
    cross join lateral merchant._line_plan_minus_provided(ol.good_id, ol.quantity, ol.provided) p
    where ol.order_id = p_order and merchant._has_provided(ol.provided)
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'item_id', s.item_id, 'qty', s.qty)), '[]'::jsonb)
  from (select kind, item_id, sum(qty) as qty from cons group by kind, item_id having sum(qty) > 1e-9) s
$$;

create or replace function merchant.order_overview(p_order uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o merchant.orders; v_needs jsonb; v_lines jsonb;
begin
  perform merchant._require(merchant.is_staff(), 'viewing orders');
  select * into o from merchant.orders where id = p_order;
  if not found then raise exception 'Order not found'; end if;

  v_needs := merchant._plan_details(merchant._order_needs(p_order));

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'good_id', l.good_id, 'good_name', l.good_name, 'quantity', l.quantity,
           'unit_price', l.unit_price,
           'ready_qty', least(l.quantity, greatest(g.stock, 0)),
           'crafted_by', l.crafted_by,
           'crafted_by_name', (select coalesce(display_name, username) from merchant.profiles where id = l.crafted_by),
           'provided', l.provided,
           -- material cost of this piece (customer materials excluded)
           'cost', greatest(l.quantity * merchant._good_unit_cost(l.good_id) - merchant._provided_cost(l.provided), 0))
         order by l.sort), '[]'::jsonb)
    into v_lines
  from merchant.order_lines l join merchant.goods g on g.id = l.good_id
  where l.order_id = p_order;

  return jsonb_build_object(
    'lines', v_lines,
    'reservations', v_needs,
    'total', (select coalesce(sum(quantity * unit_price), 0) from merchant.order_lines where order_id = p_order),
    'short', merchant._missing_text(v_needs) is not null,
    'all_crafted', not exists (select 1 from jsonb_array_elements(v_lines) e
                               where (e ->> 'ready_qty')::double precision < (e ->> 'quantity')::double precision - 1e-9));
end $$;

revoke execute on function merchant._provided_cost(jsonb), merchant._line_plan_minus_provided(uuid, double precision, jsonb)
  from public, merchant_app;
grant execute on function merchant._has_provided(jsonb) to merchant_app;
revoke execute on function merchant.set_order_line_crafter(uuid, uuid), merchant.set_order_line_provided(uuid, jsonb, double precision)
  from public;
grant execute on function merchant.set_order_line_crafter(uuid, uuid), merchant.set_order_line_provided(uuid, jsonb, double precision)
  to merchant_app;
