-- Merchantlight — who crafts an item (Tailor, Blacksmith, ...), so the Craft page can list
-- each trade's recipes together. Free text: the trades live with the shop, not in the schema.

alter table merchant.goods add column profession text;
grant insert (profession), update (profession) on merchant.goods to merchant_app;
