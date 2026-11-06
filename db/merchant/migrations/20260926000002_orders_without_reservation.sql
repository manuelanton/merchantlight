-- 2026-09-26 (owner): orders no longer reserve stock. Stock stays freely usable for
-- crafting and sales; an order only shows what it needs and warns when the current
-- stock isn't enough. (The order_reservations table stays empty and unused so older
-- code paths keep working.)

delete from merchant.order_reservations;

-- Nothing is reserved any more → available = stock everywhere.
create or replace function merchant._reserved(p_kind text, p_id uuid) returns double precision
language sql immutable set search_path = '' as $$ select 0::double precision $$;

-- Kept for existing callers (create_order, set_order_lines, craft, delete triggers): no-op now.
create or replace function merchant._reserve_order(p_order uuid)
returns void
language sql security definer set search_path = '' as $$
  delete from merchant.order_reservations where order_id = p_order
$$;

-- What an order would use right now: finished goods in stock first (partially), the rest
-- via the recipe (one level deep, like crafting). Not stored anywhere.
create function merchant._order_needs(p_order uuid)
returns jsonb
language sql stable set search_path = '' as $$
  with l as (
    select good_id, sum(quantity) as q from merchant.order_lines where order_id = p_order group by good_id
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
           'ready_qty', least(l.quantity, greatest(g.stock, 0)))
         order by l.sort), '[]'::jsonb)
    into v_lines
  from merchant.order_lines l join merchant.goods g on g.id = l.good_id
  where l.order_id = p_order;

  return jsonb_build_object(
    'lines', v_lines,
    'reservations', v_needs,   -- kept name for the frontend: "needed from current stock"
    'total', (select coalesce(sum(quantity * unit_price), 0) from merchant.order_lines where order_id = p_order),
    'short', merchant._missing_text(v_needs) is not null,
    'all_crafted', not exists (select 1 from jsonb_array_elements(v_lines) e
                               where (e ->> 'ready_qty')::double precision < (e ->> 'quantity')::double precision - 1e-9));
end $$;

revoke execute on function merchant._order_needs(uuid) from public, merchant_app;
