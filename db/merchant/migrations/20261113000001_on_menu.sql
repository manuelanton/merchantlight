-- Merchantlight — the public catalogue comes from the backoffice, as the Tavern's menu does.
-- `on_menu` decides what guests see; nothing is hidden from the staff any more.

alter table merchant.goods add column on_menu boolean not null default true;
alter table merchant.materials add column on_menu boolean not null default false;
grant insert (on_menu), update (on_menu) on merchant.goods, merchant.materials to merchant_app;

-- Items switched off in the old catalogue stay off the menu but come back to the staff.
update merchant.goods set on_menu = false, active = true where not active;

-- Variants were never listed on their own, and only the materials marked active were for sale.
do $$
begin
  if to_regclass('public.items') is not null then
    update merchant.goods g set on_menu = false
      from public.items i where btrim(i.name) = g.name and i.parent_id is not null;
    update merchant.materials m set on_menu = true
      from public.items i where btrim(i.name) = m.name and i.category_slug = 'materials' and i.active;
  end if;
end $$;
