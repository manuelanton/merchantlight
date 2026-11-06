-- Fix (2026-09-26): a sub-good that isn't available is only replaced by ITS materials
-- when those materials are fully available. Otherwise the sub-good itself stays in the
-- plan (and shows up as missing). Before, e.g. an Iron Arrow whose Iron Ingots were all
-- reserved for orders showed "Iron Ore missing 20" instead of "Iron Ingot missing 1".

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
           exists (select 1 from merchant.recipe_components r where r.good_id = d.component_good_id)
           and not exists (
             select 1 from merchant.recipe_components r
             where r.good_id = d.component_good_id
               and merchant._available(case when r.material_id is not null then 'material' else 'good' end,
                                    coalesce(r.material_id, r.component_good_id)) < r.quantity * d.need - 1e-9
           ) as recipe_available
    from direct d
    where d.component_good_id is not null
  ), cons as (
    select 'material'::text as kind, d.material_id as item_id, d.need as qty
    from direct d where d.material_id is not null
    union all
    select 'good', s.gid, s.need from sub s where s.from_stock or not s.recipe_available
    union all
    select case when rc.material_id is not null then 'material' else 'good' end,
           coalesce(rc.material_id, rc.component_good_id), rc.quantity * s.need
    from sub s
    join merchant.recipe_components rc on rc.good_id = s.gid
    where not s.from_stock and s.recipe_available
  )
  select c.kind, c.item_id, sum(c.qty) from cons c group by c.kind, c.item_id
$$;

-- Missing = what THIS plan lacks. If open orders already over-reserve an item (available < 0),
-- that deficit belongs to the orders and must not inflate the shortfall shown here.
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
$$;
