-- 2026-09-28 (owner): Leather Strips are crafted: 1 Leather → 4 Leather Strips.
--
-- 1. Recipes get a yield (goods.craft_yield, default 1): the recipe quantities are per
--    craft ("batch"), one craft makes craft_yield units. Crafting always happens in whole
--    batches — needing 5 strips uses 2 leather and makes 8; the 3 extra go to stock.
--    Unit cost = recipe cost / yield.
-- 2. Leather Strips move from raw materials to crafted materials (goods.is_material) with
--    that recipe. Stock, prices, recipes and receipt lines move along; the stock move is
--    logged. The old raw material row is removed (its history keeps the name).

alter table merchant.goods add column craft_yield int not null default 1 check (craft_yield >= 1);
comment on column merchant.goods.craft_yield is 'Units one craft of the recipe makes (recipe quantities are per craft).';
grant insert (craft_yield), update (craft_yield) on merchant.goods to merchant_app;

create or replace function merchant._good_unit_cost(p_good uuid, p_path uuid[] default '{}')
returns double precision
language plpgsql stable set search_path = '' as $$
declare
  v_cost double precision := 0;
  c record;
begin
  if p_good = any (p_path) then
    raise exception 'Circular recipe: %', (
      select string_agg(g.name, ' → ' order by x.ord)
      from unnest(p_path || p_good) with ordinality as x (gid, ord)
      join merchant.goods g on g.id = x.gid
    ) using errcode = '23514';
  end if;

  if not exists (select 1 from merchant.recipe_components where good_id = p_good) then
    return coalesce((select buy_price from merchant.goods where id = p_good), 0);
  end if;

  for c in
    select rc.quantity, rc.component_good_id, m.buy_price as material_price
    from merchant.recipe_components rc
    left join merchant.materials m on m.id = rc.material_id
    where rc.good_id = p_good
  loop
    if c.component_good_id is null then
      v_cost := v_cost + c.quantity * c.material_price;
    else
      v_cost := v_cost + c.quantity * merchant._good_unit_cost(c.component_good_id, p_path || p_good);
    end if;
  end loop;
  return v_cost / greatest(coalesce((select craft_yield from merchant.goods where id = p_good), 1), 1);
end $$;

-- Crafts needed to get p_qty units.
create function merchant._batches(p_good uuid, p_qty double precision) returns double precision
language sql stable set search_path = '' as $$
  select ceil(p_qty / greatest(coalesce((select craft_yield from merchant.goods where id = p_good), 1), 1) - 1e-9)
$$;

-- Components for p_qty units of p_good (in whole batches). Sub-goods come from stock first;
-- the rest is made from ITS materials in whole batches if they're available (surplus is
-- returned to stock as a negative entry), otherwise the rest stays as missing sub-good.
create or replace function merchant._craft_plan(p_good uuid, p_qty double precision)
returns table (kind text, item_id uuid, qty double precision)
language sql stable set search_path = '' as $$
  with direct as (
    select rc.material_id, rc.component_good_id, rc.quantity * merchant._batches(p_good, p_qty) as need
    from merchant.recipe_components rc
    where rc.good_id = p_good
  ), sub0 as (
    select d.component_good_id as gid, d.need,
           least(greatest(merchant._available('good', d.component_good_id), 0), d.need) as take
    from direct d
    where d.component_good_id is not null
  ), sub1 as (
    select s.*, s.need - s.take as rest,
           merchant._batches(s.gid, s.need - s.take) as sbatches,
           greatest(coalesce((select craft_yield from merchant.goods where id = s.gid), 1), 1) as syield
    from sub0 s
  ), sub as (
    select s.*,
           exists (select 1 from merchant.recipe_components r where r.good_id = s.gid)
           and not exists (
             select 1 from merchant.recipe_components r
             where r.good_id = s.gid
               and merchant._available(case when r.material_id is not null then 'material' else 'good' end,
                                    coalesce(r.material_id, r.component_good_id)) < r.quantity * s.sbatches - 1e-9
           ) as rest_craftable
    from sub1 s
  ), cons as (
    select 'material'::text as kind, d.material_id as item_id, d.need as qty
    from direct d where d.material_id is not null
    union all
    select 'good', s.gid, s.take from sub s where s.take > 1e-9
    union all
    select 'good', s.gid, s.rest from sub s where s.rest > 1e-9 and not s.rest_craftable
    union all
    select case when rc.material_id is not null then 'material' else 'good' end,
           coalesce(rc.material_id, rc.component_good_id), rc.quantity * s.sbatches
    from sub s
    join merchant.recipe_components rc on rc.good_id = s.gid
    where s.rest > 1e-9 and s.rest_craftable
    union all
    -- whole batches make more than needed → the extra goes back to stock
    select 'good', s.gid, -(s.sbatches * s.syield - s.rest)
    from sub s
    where s.rest > 1e-9 and s.rest_craftable and s.sbatches * s.syield - s.rest > 1e-9
  )
  select c.kind, c.item_id, sum(c.qty) from cons c group by c.kind, c.item_id having abs(sum(c.qty)) > 1e-9
$$;

-- Selling: take from stock, craft the rest on the spot (surplus of that craft back to stock).
-- Crafting: everything from the recipe; craft() books the produced units itself.
create or replace function merchant._resolve_consumption(p_items jsonb, p_prefer_stock boolean)
returns jsonb
language sql stable set search_path = '' as $$
  with items as (
    select (e ->> 'good_id')::uuid as good_id, sum((e ->> 'qty')::double precision) as q
    from jsonb_array_elements(p_items) e
    group by 1
  ), decided as (
    select i.good_id, i.q,
           case when p_prefer_stock then least(greatest(merchant._available('good', i.good_id), 0), i.q) else 0 end as take,
           exists (select 1 from merchant.recipe_components rc where rc.good_id = i.good_id) as has_recipe,
           greatest(coalesce((select craft_yield from merchant.goods where id = i.good_id), 1), 1) as yld
    from items i
  ), cons as (
    select 'good'::text as kind, d.good_id as item_id, d.take as qty from decided d where d.take > 1e-9
    union all
    select 'good', d.good_id, d.q - d.take from decided d where d.q - d.take > 1e-9 and not d.has_recipe
    union all
    select p.kind, p.item_id, p.qty
    from decided d
    cross join lateral merchant._craft_plan(d.good_id, d.q - d.take) p
    where d.q - d.take > 1e-9 and d.has_recipe
    union all
    select 'good', d.good_id, -(merchant._batches(d.good_id, d.q - d.take) * d.yld - (d.q - d.take))
    from decided d
    where p_prefer_stock and d.has_recipe and d.q - d.take > 1e-9
      and merchant._batches(d.good_id, d.q - d.take) * d.yld - (d.q - d.take) > 1e-9
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'item_id', s.item_id, 'qty', s.qty)), '[]'::jsonb)
  from (select c.kind, c.item_id, sum(c.qty) as qty from cons c group by c.kind, c.item_id having abs(sum(c.qty)) > 1e-9) s
$$;

-- Shown lines: only what is taken (surplus returned to stock isn't a "need").
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
           'missing', case when x.qty - greatest(a.available, 0) > 1e-9 then x.qty - greatest(a.available, 0) else 0 end)
         order by x.kind desc, coalesce(m.name, g.name)), '[]'::jsonb)
  from jsonb_to_recordset(p_plan) as x (kind text, item_id uuid, qty double precision)
  left join merchant.materials m on x.kind = 'material' and m.id = x.item_id
  left join merchant.goods g on x.kind = 'good' and g.id = x.item_id
  cross join lateral (select merchant._available(x.kind, x.item_id) as available,
                             merchant._reserved(x.kind, x.item_id) as reserved) a
  where x.qty > 1e-9
$$;

create or replace function merchant.craft(p_good uuid, p_qty double precision, p_note text default null, p_order uuid default null)
returns merchant.crafts
language plpgsql security definer set search_path = '' as $$
declare
  v_craft    merchant.crafts;
  v_name     text;
  v_plan     jsonb;
  v_note     text;
  v_produced double precision;
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

  -- whole crafts: asking for 5 strips at 4 per craft makes 8
  v_produced := merchant._batches(p_good, p_qty) * greatest((select craft_yield from merchant.goods where id = p_good), 1);

  perform set_config('merchant.order_ctx', coalesce(p_order::text, ''), true);
  v_note := format('Crafted %s × %s', trim_scale(v_produced::numeric), v_name)
    || coalesce(format(' for order #%s', (select order_no from merchant.orders where id = p_order)), '')
    || coalesce(' — ' || p_note, '');

  v_plan := merchant._resolve_consumption(
    jsonb_build_array(jsonb_build_object('good_id', p_good, 'qty', p_qty)), false);

  insert into merchant.crafts (good_id, good_name, quantity, created_by, created_by_name, order_id)
  values (p_good, v_name, v_produced, merchant_auth.uid(), merchant._actor_name(), p_order)
  returning * into v_craft;

  update merchant.crafts
  set consumed = merchant._execute_plan(v_plan, 'Production', v_note, 'craft', v_craft.id)
  where id = v_craft.id
  returning * into v_craft;

  perform merchant._apply_stock('good', p_good, v_produced, 'Production', v_note, 'craft', v_craft.id);
  perform set_config('merchant.order_ctx', '', true);

  if p_order is not null then perform merchant._reserve_order(p_order); end if;
  return v_craft;
end $$;

revoke execute on function merchant._batches(uuid, double precision) from public, merchant_app;

