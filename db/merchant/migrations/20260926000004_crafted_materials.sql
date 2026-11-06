-- 2026-09-26 (owner): ingots & co. are MATERIALS, armor/weapons are FINISHED GOODS.
-- Crafted intermediates (smelted ingots, refined moonstone) keep living in merchant.goods
-- because they have a recipe (smelting) and can be crafted — they're just flagged as
-- materials so the app lists and values them as materials.

alter table merchant.goods add column is_material boolean not null default false;
comment on column merchant.goods.is_material is
  'Crafted material (e.g. ingots): has a recipe like a good, but is shown and valued as a material.';


grant insert (is_material), update (is_material) on merchant.goods to merchant_app;
