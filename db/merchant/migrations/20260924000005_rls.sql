-- Merchantlight — Row Level Security, grants
--
-- Access matrix (mirrors src/lib/roles.ts — keep both in sync):
--   owner : everything, incl. users + settings
--   manager      : everything operational; NO user/role management, NO settings writes
--   employee        : read catalog/stock, craft, own receipts (create/post), activity log
--   supplier     : read materials only
--   visitor      : nothing beyond their own profile

-- Start from zero: the app role gets only what is granted below.
revoke all on all tables in schema merchant from merchant_app;
revoke all on all sequences in schema merchant from merchant_app;
revoke execute on all functions in schema merchant from public, merchant_app;

alter table merchant.profiles            enable row level security;
alter table merchant.settings            enable row level security;
alter table merchant.materials           enable row level security;
alter table merchant.goods               enable row level security;
alter table merchant.recipe_components   enable row level security;
alter table merchant.stock_movements     enable row level security;
alter table merchant.treasury_categories enable row level security;
alter table merchant.treasury_entries    enable row level security;
alter table merchant.crafts              enable row level security;
alter table merchant.sales               enable row level security;
alter table merchant.sale_lines          enable row level security;
alter table merchant.purchases           enable row level security;
alter table merchant.purchase_lines      enable row level security;
alter table merchant.storage_units       enable row level security;
alter table merchant.rentals             enable row level security;

-- Helper functions used inside policies must be callable.
grant execute on function merchant.my_role(), merchant.is_owner(), merchant.is_manager(),
  merchant.is_staff(), merchant.can_view_materials() to merchant_app;
grant execute on function merchant._can_edit_sale(merchant.sales) to merchant_app;

-- profiles --------------------------------------------------------------------
grant select on merchant.profiles to merchant_app;
create policy profiles_select on merchant.profiles for select to merchant_app
  using (id = merchant_auth.uid() or (select merchant.is_staff()));
-- No insert/update/delete: written by upsert_discord_profile() and set_role_override().

-- settings --------------------------------------------------------------------
grant select on merchant.settings to merchant_app;
grant update (safety_buffer, commission_rate, low_stock_default, currency_symbol) on merchant.settings to merchant_app;
create policy settings_select on merchant.settings for select to merchant_app
  using ((select merchant.can_view_materials()));
create policy settings_update on merchant.settings for update to merchant_app
  using ((select merchant.is_owner())) with check ((select merchant.is_owner()));

-- materials / goods / recipes -------------------------------------------------
grant select, delete on merchant.materials, merchant.goods to merchant_app;
grant insert (name, category, unit, buy_price, min_stock, notes, active),
      update (name, category, unit, buy_price, min_stock, notes, active) on merchant.materials to merchant_app;
grant insert (name, category, sell_price, buy_price, min_stock, notes, active),
      update (name, category, sell_price, buy_price, min_stock, notes, active) on merchant.goods to merchant_app;

create policy materials_select on merchant.materials for select to merchant_app
  using ((select merchant.can_view_materials()));
create policy materials_insert on merchant.materials for insert to merchant_app
  with check ((select merchant.is_manager()));
create policy materials_update on merchant.materials for update to merchant_app
  using ((select merchant.is_manager())) with check ((select merchant.is_manager()));
create policy materials_delete on merchant.materials for delete to merchant_app
  using ((select merchant.is_manager()));

create policy goods_select on merchant.goods for select to merchant_app
  using ((select merchant.is_staff()));
create policy goods_insert on merchant.goods for insert to merchant_app
  with check ((select merchant.is_manager()));
create policy goods_update on merchant.goods for update to merchant_app
  using ((select merchant.is_manager())) with check ((select merchant.is_manager()));
create policy goods_delete on merchant.goods for delete to merchant_app
  using ((select merchant.is_manager()));

grant select, insert, update, delete on merchant.recipe_components to merchant_app;
create policy recipes_select on merchant.recipe_components for select to merchant_app
  using ((select merchant.is_staff()));
create policy recipes_insert on merchant.recipe_components for insert to merchant_app
  with check ((select merchant.is_manager()));
create policy recipes_update on merchant.recipe_components for update to merchant_app
  using ((select merchant.is_manager())) with check ((select merchant.is_manager()));
create policy recipes_delete on merchant.recipe_components for delete to merchant_app
  using ((select merchant.is_manager()));

-- stock movements (read-only, append-only) -----------------------------------
grant select on merchant.stock_movements to merchant_app;
create policy stock_movements_select on merchant.stock_movements for select to merchant_app
  using ((select merchant.is_staff()));

-- treasury --------------------------------------------------------------------
grant select, insert, update, delete on merchant.treasury_categories to merchant_app;
create policy treasury_categories_select on merchant.treasury_categories for select to merchant_app
  using ((select merchant.is_manager()));
create policy treasury_categories_insert on merchant.treasury_categories for insert to merchant_app
  with check ((select merchant.is_manager()) and not is_system);
create policy treasury_categories_update on merchant.treasury_categories for update to merchant_app
  using ((select merchant.is_manager()) and not is_system)
  with check ((select merchant.is_manager()) and not is_system);
create policy treasury_categories_delete on merchant.treasury_categories for delete to merchant_app
  using ((select merchant.is_manager()) and not is_system);

grant select, delete on merchant.treasury_entries to merchant_app;
grant insert (entry_date, category, description, money_in, money_out, beneficiary_id),
      update (entry_date, category, description, money_in, money_out, beneficiary_id)
  on merchant.treasury_entries to merchant_app;
create policy treasury_entries_select on merchant.treasury_entries for select to merchant_app
  using ((select merchant.is_manager()));
-- Manual entries only; document-linked entries (ref_type set) change only via their document.
create policy treasury_entries_insert on merchant.treasury_entries for insert to merchant_app
  with check ((select merchant.is_manager()) and ref_type is null
    and category not in (select name from merchant.treasury_categories where is_system));
create policy treasury_entries_update on merchant.treasury_entries for update to merchant_app
  using ((select merchant.is_manager()) and ref_type is null)
  with check ((select merchant.is_manager()) and ref_type is null
    and category not in (select name from merchant.treasury_categories where is_system));
create policy treasury_entries_delete on merchant.treasury_entries for delete to merchant_app
  using ((select merchant.is_manager()) and ref_type is null);

-- crafts ----------------------------------------------------------------------
grant select, delete on merchant.crafts to merchant_app;
create policy crafts_select on merchant.crafts for select to merchant_app
  using ((select merchant.is_staff()));
create policy crafts_delete on merchant.crafts for delete to merchant_app
  using ((select merchant.is_manager()));

-- sales -----------------------------------------------------------------------
grant select, delete on merchant.sales to merchant_app;
grant insert (sale_date, seller_id, customer, discount, tip, notes),
      update (sale_date, seller_id, customer, discount, tip, notes) on merchant.sales to merchant_app;
create policy sales_select on merchant.sales for select to merchant_app
  using ((select merchant.is_manager())
      or ((select merchant.is_staff()) and (seller_id = merchant_auth.uid() or created_by = merchant_auth.uid())));
-- Employees can only create receipts in their own name; managers for anyone.
create policy sales_insert on merchant.sales for insert to merchant_app
  with check (status = 'draft'
    and ((select merchant.is_manager()) or ((select merchant.is_staff()) and seller_id = merchant_auth.uid())));
create policy sales_update on merchant.sales for update to merchant_app
  using (status = 'draft' and merchant._can_edit_sale(sales))
  with check (status = 'draft'
    and ((select merchant.is_manager()) or ((select merchant.is_staff()) and seller_id = merchant_auth.uid())));
-- Posted receipts: managers only (the delete trigger reverses stock + treasury).
create policy sales_delete on merchant.sales for delete to merchant_app
  using ((select merchant.is_manager()) or (status = 'draft' and merchant._can_edit_sale(sales)));

grant select, delete on merchant.sale_lines to merchant_app;
grant insert (sale_id, good_id, quantity, unit_price),
      update (good_id, quantity, unit_price) on merchant.sale_lines to merchant_app;
create policy sale_lines_select on merchant.sale_lines for select to merchant_app
  using (exists (select 1 from merchant.sales s where s.id = sale_id));
create policy sale_lines_insert on merchant.sale_lines for insert to merchant_app
  with check (exists (select 1 from merchant.sales s
                      where s.id = sale_id and s.status = 'draft' and merchant._can_edit_sale(s)));
create policy sale_lines_update on merchant.sale_lines for update to merchant_app
  using (exists (select 1 from merchant.sales s
                 where s.id = sale_id and s.status = 'draft' and merchant._can_edit_sale(s)));
create policy sale_lines_delete on merchant.sale_lines for delete to merchant_app
  using (exists (select 1 from merchant.sales s
                 where s.id = sale_id and s.status = 'draft' and merchant._can_edit_sale(s)));

-- purchases -------------------------------------------------------------------
grant select, delete on merchant.purchases to merchant_app;
grant select on merchant.purchase_lines to merchant_app;
create policy purchases_select on merchant.purchases for select to merchant_app
  using ((select merchant.is_manager()));
create policy purchases_delete on merchant.purchases for delete to merchant_app
  using ((select merchant.is_manager()));
create policy purchase_lines_select on merchant.purchase_lines for select to merchant_app
  using ((select merchant.is_manager()));

-- storage rentals -------------------------------------------------------------
grant select, insert, update, delete on merchant.storage_units to merchant_app;
create policy storage_units_select on merchant.storage_units for select to merchant_app
  using ((select merchant.is_staff()));
create policy storage_units_insert on merchant.storage_units for insert to merchant_app
  with check ((select merchant.is_manager()));
create policy storage_units_update on merchant.storage_units for update to merchant_app
  using ((select merchant.is_manager())) with check ((select merchant.is_manager()));
create policy storage_units_delete on merchant.storage_units for delete to merchant_app
  using ((select merchant.is_manager()));

grant select, delete on merchant.rentals to merchant_app;
grant update (renter, notes) on merchant.rentals to merchant_app;
create policy rentals_select on merchant.rentals for select to merchant_app
  using ((select merchant.is_staff()));
create policy rentals_update on merchant.rentals for update to merchant_app
  using ((select merchant.is_manager())) with check ((select merchant.is_manager()));
create policy rentals_delete on merchant.rentals for delete to merchant_app
  using ((select merchant.is_manager()));

-- RPCs callable by the app (each checks the caller's role itself) ------------
grant execute on function
  merchant.set_role_override(uuid, merchant.app_role),
  merchant.good_costs(),
  merchant.adjust_stock(text, uuid, double precision, merchant.stock_reason, text),
  merchant.treasury_balance(),
  merchant.craft_preview(uuid, double precision),
  merchant.craft(uuid, double precision, text),
  merchant.craft_capacity(),
  merchant.sale_post_preview(uuid),
  merchant.post_sale(uuid),
  merchant.create_purchase(jsonb, text, text, boolean, timestamptz),
  merchant.create_rental(uuid, text, int, date, double precision, text),
  merchant.extend_rental(uuid, int),
  merchant.end_rental(uuid)
to merchant_app;


-- Future objects must be granted explicitly.
alter default privileges in schema merchant revoke all on tables from merchant_app;
alter default privileges in schema merchant revoke execute on functions from public, merchant_app;

