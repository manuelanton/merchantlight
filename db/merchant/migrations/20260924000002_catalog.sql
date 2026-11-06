-- Merchantlight — catalog: materials, goods, recursive recipes, cost engine
--
-- `stock` is a plain column (no separate quantity model). It is NOT writable by
-- clients (see column grants in the RLS migration); every change goes through
-- merchant._apply_stock(), which also writes the stock_movements audit log.

create table merchant.materials (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (btrim(name) <> ''),
  category   text not null default 'Other',
  unit       text not null default 'pc',
  buy_price  double precision not null default 0 check (buy_price >= 0),
  stock      double precision not null default 0 check (stock >= 0),
  min_stock  double precision not null default 0 check (min_stock >= 0),
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table merchant.goods (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (btrim(name) <> ''),
  category   text not null default 'Other',
  sell_price double precision not null default 0 check (sell_price >= 0),
  -- Purchase price when the good is bought instead of crafted; ignored for cost if a recipe exists.
  buy_price  double precision check (buy_price >= 0),
  stock      double precision not null default 0 check (stock >= 0),
  min_stock  double precision not null default 0 check (min_stock >= 0),
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger materials_touch before update on merchant.materials
  for each row execute function merchant._touch_updated_at();
create trigger goods_touch before update on merchant.goods
  for each row execute function merchant._touch_updated_at();

-- A recipe row: `good_id` needs `quantity` of EITHER a material OR another good.
create table merchant.recipe_components (
  id                uuid primary key default gen_random_uuid(),
  good_id           uuid not null references merchant.goods (id) on delete cascade,
  material_id       uuid references merchant.materials (id) on delete restrict,
  component_good_id uuid references merchant.goods (id) on delete restrict,
  quantity          double precision not null check (quantity > 0),
  created_at        timestamptz not null default now(),
  constraint recipe_component_one_kind check ((material_id is null) <> (component_good_id is null)),
  constraint recipe_component_not_self check (component_good_id is distinct from good_id),
  constraint recipe_component_material_unique unique (good_id, material_id),
  constraint recipe_component_good_unique unique (good_id, component_good_id)
);
create index recipe_components_good_idx on merchant.recipe_components (good_id);
create index recipe_components_component_idx on merchant.recipe_components (component_good_id);

-- Reject edits that would make a recipe contain itself (directly or transitively).
create function merchant._recipe_cycle_guard() returns trigger
language plpgsql set search_path = '' as $$
declare v_name text;
begin
  if new.component_good_id is null then return new; end if;
  if exists (
    with recursive walk (gid) as (
      select new.component_good_id
      union
      select rc.component_good_id
      from merchant.recipe_components rc
      join walk on rc.good_id = walk.gid
      where rc.component_good_id is not null
    )
    select 1 from walk where gid = new.good_id
  ) then
    select name into v_name from merchant.goods where id = new.good_id;
    raise exception 'Circular recipe: "%" would end up containing itself', v_name using errcode = '23514';
  end if;
  return new;
end $$;

create trigger recipe_components_cycle_guard
  before insert or update on merchant.recipe_components
  for each row execute function merchant._recipe_cycle_guard();

-- Cost engine -----------------------------------------------------------------
-- Unit cost of a good = Σ(component qty × component unit cost) if it has a recipe,
-- else its buy_price (0 if unknown). Recursion carries the visited path so a
-- cycle (e.g. from bad imported data) raises instead of looping forever.

create function merchant._good_unit_cost(p_good uuid, p_path uuid[] default '{}')
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
  return v_cost;
end $$;

-- All goods with their computed cost; a cycle is reported per good instead of failing the whole list.
create function merchant.good_costs()
returns table (good_id uuid, unit_cost double precision, has_recipe boolean, cost_error text)
language plpgsql stable security definer set search_path = '' as $$
declare g record;
begin
  perform merchant._require(merchant.is_staff(), 'viewing costs');
  for g in select id from merchant.goods loop
    good_id := g.id;
    has_recipe := exists (select 1 from merchant.recipe_components rc where rc.good_id = g.id);
    begin
      unit_cost := merchant._good_unit_cost(g.id);
      cost_error := null;
    exception when check_violation then
      unit_cost := null;
      cost_error := sqlerrm;
    end;
    return next;
  end loop;
end $$;
