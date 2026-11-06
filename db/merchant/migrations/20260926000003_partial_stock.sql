-- 2026-09-26: use what is in stock first, craft only the rest.
-- Before, a sub-good (or a sold good) that wasn't FULLY in stock was made entirely from its
-- materials: needing 5 ingots with 3 in stock smelted all 5. Now 3 come from stock and only
-- 2 are smelted — and only if their materials are available; otherwise the 2 show as missing.

create or replace function merchant._craft_plan(p_good uuid, p_qty double precision)
returns table (kind text, item_id uuid, qty double precision)
language sql stable set search_path = '' as $$
  with direct as (
    select rc.material_id, rc.component_good_id, rc.quantity * p_qty as need
    from merchant.recipe_components rc
    where rc.good_id = p_good
  ), sub0 as (
    select d.component_good_id as gid, d.need,
           least(greatest(merchant._available('good', d.component_good_id), 0), d.need) as take
    from direct d
    where d.component_good_id is not null
  ), sub as (
    select s.gid, s.need, s.take, s.need - s.take as rest,
           exists (select 1 from merchant.recipe_components r where r.good_id = s.gid)
           and not exists (
             select 1 from merchant.recipe_components r
             where r.good_id = s.gid
               and merchant._available(case when r.material_id is not null then 'material' else 'good' end,
                                    coalesce(r.material_id, r.component_good_id)) < r.quantity * (s.need - s.take) - 1e-9
           ) as rest_craftable
    from sub0 s
  ), cons as (
    select 'material'::text as kind, d.material_id as item_id, d.need as qty
    from direct d where d.material_id is not null
    union all
    select 'good', s.gid, s.take from sub s where s.take > 1e-9
    union all
    select 'good', s.gid, s.rest from sub s where s.rest > 1e-9 and not s.rest_craftable
    union all
    select case when rc.material_id is not null then 'material' else 'good' end,
           coalesce(rc.material_id, rc.component_good_id), rc.quantity * s.rest
    from sub s
    join merchant.recipe_components rc on rc.good_id = s.gid
    where s.rest > 1e-9 and s.rest_craftable
  )
  select c.kind, c.item_id, sum(c.qty) from cons c group by c.kind, c.item_id having sum(c.qty) > 1e-9
$$;

-- Selling (p_prefer_stock): take what is in stock, craft the rest on the spot.
-- Crafting (not p_prefer_stock): everything is made from the recipe.
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
           exists (select 1 from merchant.recipe_components rc where rc.good_id = i.good_id) as has_recipe
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
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'item_id', s.item_id, 'qty', s.qty)), '[]'::jsonb)
  from (select c.kind, c.item_id, sum(c.qty) as qty from cons c group by c.kind, c.item_id) s
$$;
