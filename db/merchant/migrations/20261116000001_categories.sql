-- Merchantlight — categories become a fixed list. Items can only be in one that exists, new ones
-- are added under Settings. Raw Materials holds everything recipes are made of: all materials,
-- and any item put in it. It and Other always exist.

create table merchant.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (btrim(name) <> ''),
  slug       text not null unique,
  icon       text not null default '',
  sort_order int not null default 50,
  is_system  boolean not null default false
);

alter table merchant.categories enable row level security;
grant select on merchant.categories to merchant_app;
create policy categories_select on merchant.categories for select to merchant_app using ((select merchant.is_staff()));

-- The public catalogue's sections keep their addresses, icons and order.
do $$
begin
  if to_regclass('public.categories') is not null then
    insert into merchant.categories (name, slug, icon, sort_order)
    select case when name = 'Materials' then 'Raw Materials' else name end, slug, coalesce(icon, ''), sort_order
    from public.categories;
  end if;
end $$;

insert into merchant.categories (name, slug, icon, sort_order) values
  ('Clothes', 'clothes', '', 1),
  ('Bags & Containers', 'bags', '', 2),
  ('Armor', 'armor', '', 3),
  ('Weapons', 'weapons', '', 4),
  ('Potions & Alchemy', 'potions', '', 5),
  ('Food & Drink', 'food', '', 6),
  ('Trade Goods', 'trade-goods', '', 7),
  ('Raw Materials', 'materials', '', 8),
  ('Enchantments', 'enchantments', '', 9),
  ('Jewelry', 'jewelry', '', 10),
  ('Other', 'other', '', 99)
on conflict do nothing;

update merchant.categories set is_system = true where name in ('Raw Materials', 'Other');

update merchant.goods set category = 'Raw Materials' where category = 'Materials';
update merchant.materials set category = 'Raw Materials';
update merchant.sale_lines set category = 'Raw Materials' where category = 'Materials';

insert into merchant.categories (name, slug)
select c, trim(both '-' from regexp_replace(lower(c), '[^a-z0-9]+', '-', 'g'))
from (select distinct category as c from merchant.goods) x
on conflict do nothing;

alter table merchant.materials alter column category set default 'Raw Materials';
alter table merchant.goods add constraint goods_category_fk
  foreign key (category) references merchant.categories (name) on update cascade;
alter table merchant.materials add constraint materials_category_fk
  foreign key (category) references merchant.categories (name) on update cascade;

create function merchant.add_category(p_name text) returns merchant.categories
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := trim(both '-' from regexp_replace(lower(btrim(coalesce(p_name, ''))), '[^a-z0-9]+', '-', 'g'));
  c merchant.categories;
begin
  perform merchant._require(merchant.is_manager(), 'changing categories');
  if v_slug = '' then raise exception 'Give the category a name' using errcode = 'P0001'; end if;
  if exists (select 1 from merchant.categories where lower(name) = lower(v_name) or slug = v_slug) then
    raise exception 'That category already exists' using errcode = 'P0001';
  end if;
  insert into merchant.categories (name, slug) values (v_name, v_slug) returning * into c;
  return c;
end $$;

-- The address in the catalogue stays, so old links keep working.
create function merchant.rename_category(p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  perform merchant._require(merchant.is_manager(), 'changing categories');
  if v_name = '' then raise exception 'Give the category a name' using errcode = 'P0001'; end if;
  if exists (select 1 from merchant.categories where id = p_id and is_system) then
    raise exception 'This category can''t be renamed' using errcode = 'P0001';
  end if;
  if exists (select 1 from merchant.categories where lower(name) = lower(v_name) and id <> p_id) then
    raise exception 'That category already exists' using errcode = 'P0001';
  end if;
  update merchant.categories set name = v_name where id = p_id;
end $$;

create function merchant.remove_category(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c merchant.categories;
  v_used int;
begin
  perform merchant._require(merchant.is_manager(), 'changing categories');
  select * into c from merchant.categories where id = p_id for update;
  if not found then raise exception 'Category not found' using errcode = 'P0001'; end if;
  if c.is_system then raise exception 'This category can''t be removed' using errcode = 'P0001'; end if;
  select count(*) into v_used from merchant.goods where category = c.name and active;
  if v_used > 0 then
    raise exception 'Move the items out of % first (% left)', c.name, v_used using errcode = 'P0001';
  end if;
  update merchant.goods set category = 'Other' where category = c.name;
  delete from merchant.categories where id = p_id;
end $$;

revoke execute on function merchant.add_category(text), merchant.rename_category(uuid, text), merchant.remove_category(uuid) from public;
grant execute on function merchant.add_category(text), merchant.rename_category(uuid, text), merchant.remove_category(uuid) to merchant_app;
