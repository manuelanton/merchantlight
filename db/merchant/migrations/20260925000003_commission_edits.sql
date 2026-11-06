-- 2026-09-25 (owner):
-- 1. Employee payout per receipt = sale price − material cost − merchant keep,
--    merchant keep = company_share (10 %) of the sale price (after discount, before tip).
--    Never negative: if a receipt doesn't cover cost + keep, the employee gets 0.
-- 2. Every receipt and purchase can be edited and deleted:
--    - unpost_sale() reopens a posted receipt (stock + bookings reversed) so it can
--      be edited and posted again; posted receipts can be deleted by their seller too.
--    - update_purchase() edits a purchase in place: stock is corrected by the
--      difference only, treasury bookings are rebuilt.
-- 3. good_sale_preview(): what selling a good would use (stock or recipe materials).

comment on column merchant.settings.company_share is 'Merchantlight keep: share of each receipt''s sale price (after discount) that stays with the merchant.';

create or replace function merchant._employee_commission(p_net double precision, p_cost double precision, p_company_share double precision)
returns double precision
language sql immutable set search_path = '' as $$
  select round(greatest(p_net - coalesce(p_cost, 0) - p_net * p_company_share, 0)::numeric, 2)::double precision
$$;

create or replace function merchant.sale_post_preview(p_sale uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s merchant.sales;
  v_sub   double precision;
  v_net   double precision;
  v_cost  double precision;
  v_share double precision;
  v_comm  double precision;
  v_details jsonb;
begin
  select * into s from merchant.sales where id = p_sale;
  if not found then raise exception 'Receipt not found'; end if;
  perform merchant._require(merchant._can_edit_sale(s), 'posting this receipt');

  select coalesce(sum(quantity * unit_price), 0),
         coalesce(sum(quantity * merchant._good_unit_cost(good_id)) filter (where good_id is not null), 0)
    into v_sub, v_cost
  from merchant.sale_lines where sale_id = p_sale;
  v_net := greatest(v_sub - s.discount, 0);
  select company_share into v_share from merchant.settings;
  v_comm := merchant._employee_commission(v_net, v_cost, v_share);
  v_details := merchant._plan_details(merchant._resolve_consumption(
    (select coalesce(jsonb_agg(jsonb_build_object('good_id', good_id, 'qty', quantity)), '[]'::jsonb)
     from merchant.sale_lines where sale_id = p_sale and good_id is not null), true));
  return jsonb_build_object(
    'subtotal', v_sub,
    'discount', s.discount,
    'net_total', v_net,
    'cost_total', v_cost,
    'profit', v_net - v_cost,
    'tip', s.tip,
    'company_share', v_share,
    'merchant_keep', round((v_net * v_share)::numeric, 2)::double precision,
    'commission_amount', v_comm,
    'merchant_amount', v_net - v_cost - v_comm,
    'ok', merchant._missing_text(v_details) is null,
    'missing_text', merchant._missing_text(v_details),
    'lines', v_details);
end $$;

create or replace function merchant.post_sale(p_sale uuid)
returns merchant.sales
language plpgsql security definer set search_path = '' as $$
declare
  s        merchant.sales;
  v_sub    double precision;
  v_net    double precision;
  v_cost   double precision;
  v_share  double precision;
  v_comm   double precision;
  v_label  text;
begin
  select * into s from merchant.sales where id = p_sale for update;
  if not found then raise exception 'Receipt not found'; end if;
  perform merchant._require(merchant._can_edit_sale(s), 'posting this receipt');
  if s.status <> 'draft' then raise exception 'Receipt #% is already posted', s.receipt_no; end if;
  if not exists (select 1 from merchant.sale_lines where sale_id = p_sale) then
    raise exception 'Receipt #% has no lines', s.receipt_no using errcode = 'P0001';
  end if;
  if exists (select 1 from merchant.sale_lines where sale_id = p_sale and good_id is null) then
    raise exception 'Receipt #% references a deleted good', s.receipt_no using errcode = 'P0001';
  end if;

  select sum(quantity * unit_price) into v_sub from merchant.sale_lines where sale_id = p_sale;
  if s.discount > v_sub + 1e-9 then
    raise exception 'Discount (%) exceeds subtotal (%)', s.discount, v_sub using errcode = 'P0001';
  end if;
  v_net := round((v_sub - s.discount)::numeric, 2)::double precision;
  v_label := format('Receipt #%s', s.receipt_no);

  update merchant.sale_lines set unit_cost = merchant._good_unit_cost(good_id) where sale_id = p_sale;
  select coalesce(sum(quantity * unit_cost), 0) into v_cost from merchant.sale_lines where sale_id = p_sale;

  select company_share into v_share from merchant.settings;
  v_comm := merchant._employee_commission(v_net, v_cost, v_share);

  perform merchant._execute_plan(
    merchant._resolve_consumption(
      (select jsonb_agg(jsonb_build_object('good_id', good_id, 'qty', quantity))
       from merchant.sale_lines where sale_id = p_sale), true),
    'Sale', v_label, 'sale', p_sale);

  perform merchant._book('Sales income', v_net, 0,
    v_label || coalesce(' — ' || nullif(btrim(s.customer), ''), ''), 'sale', p_sale, null, s.sale_date);
  perform merchant._book('Commission', 0, v_comm,
    format('Payout %s: sale %s − material %s − merchant keep %s%% — %s',
      s.seller_name, trim_scale(round(v_net::numeric, 2)), trim_scale(round(v_cost::numeric, 2)),
      trim_scale(round((v_share * 100)::numeric, 2)), v_label),
    'sale', p_sale, s.seller_id, s.sale_date);

  update merchant.sales set
    status = 'posted', subtotal = v_sub, net_total = v_net, cost_total = v_cost,
    company_share = v_share, commission_amount = v_comm,
    posted_at = now(), posted_by = merchant_auth.uid()
  where id = p_sale
  returning * into s;
  return s;
end $$;

-- Reopen a posted receipt for editing: stock comes back, income + payout are removed.
create function merchant.unpost_sale(p_sale uuid)
returns merchant.sales
language plpgsql security definer set search_path = '' as $$
declare s merchant.sales;
begin
  select * into s from merchant.sales where id = p_sale for update;
  if not found then raise exception 'Receipt not found'; end if;
  perform merchant._require(merchant._can_edit_sale(s), 'editing this receipt');
  if s.status <> 'posted' then raise exception 'Receipt #% is not posted', s.receipt_no; end if;

  perform merchant._reverse_ref('sale', p_sale, format('Receipt #%s reopened for editing', s.receipt_no));
  update merchant.sale_lines set unit_cost = null where sale_id = p_sale;
  update merchant.sales set
    status = 'draft', subtotal = null, net_total = null, cost_total = null,
    company_share = null, commission_amount = null, posted_at = null, posted_by = null
  where id = p_sale
  returning * into s;
  return s;
end $$;

-- Posted receipts: deletable by managers and by their own seller/creator (reversal runs in the trigger).
drop policy sales_delete on merchant.sales;
create policy sales_delete on merchant.sales for delete to merchant_app
  using ((select merchant.is_manager()) or merchant._can_edit_sale(sales));

-- Purchases -------------------------------------------------------------------

-- Validates lines, writes purchase_lines, returns {materials, goods} totals. No stock/treasury.
create function merchant._write_purchase_lines(p_purchase uuid, p_lines jsonb, p_update_prices boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x record; v_name text;
  v_mat double precision := 0; v_goods double precision := 0;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A purchase needs at least one line' using errcode = 'P0001';
  end if;
  delete from merchant.purchase_lines where purchase_id = p_purchase;
  for x in select * from jsonb_to_recordset(p_lines)
             as r (kind text, item_id uuid, qty double precision, unit_price double precision)
  loop
    if x.qty is null or x.qty <= 0 or x.unit_price is null or x.unit_price < 0 then
      raise exception 'Invalid purchase line (quantity must be > 0, price >= 0)' using errcode = 'P0001';
    end if;
    v_name := null;
    if x.kind = 'material' then
      select name into v_name from merchant.materials where id = x.item_id;
      v_mat := v_mat + x.qty * x.unit_price;
      if p_update_prices then update merchant.materials set buy_price = x.unit_price where id = x.item_id; end if;
    elsif x.kind = 'good' then
      select name into v_name from merchant.goods where id = x.item_id;
      v_goods := v_goods + x.qty * x.unit_price;
      if p_update_prices then update merchant.goods set buy_price = x.unit_price where id = x.item_id; end if;
    else
      raise exception 'Unknown item kind %', x.kind;
    end if;
    if v_name is null then raise exception 'Item % not found', x.item_id; end if;
    insert into merchant.purchase_lines (purchase_id, material_id, good_id, item_kind, item_name, quantity, unit_price)
    values (p_purchase,
            case when x.kind = 'material' then x.item_id end,
            case when x.kind = 'good' then x.item_id end,
            x.kind, v_name, x.qty, x.unit_price);
  end loop;
  return jsonb_build_object('materials', v_mat, 'goods', v_goods);
end $$;

create function merchant._book_purchase(p_purchase uuid, p_totals jsonb)
returns merchant.purchases
language plpgsql security definer set search_path = '' as $$
declare v_p merchant.purchases; v_label text;
begin
  select * into v_p from merchant.purchases where id = p_purchase;
  v_label := format('Purchase #%s', v_p.purchase_no) || coalesce(' — ' || v_p.supplier, '');
  delete from merchant.treasury_entries where ref_type = 'purchase' and ref_id = p_purchase;
  perform merchant._book('Material purchase', 0, (p_totals ->> 'materials')::double precision, v_label, 'purchase', p_purchase, null, v_p.purchase_date);
  perform merchant._book('Goods purchase', 0, (p_totals ->> 'goods')::double precision, v_label, 'purchase', p_purchase, null, v_p.purchase_date);
  update merchant.purchases
  set total = round(((p_totals ->> 'materials')::numeric + (p_totals ->> 'goods')::numeric), 2)::double precision
  where id = p_purchase returning * into v_p;
  return v_p;
end $$;

create or replace function merchant.create_purchase(
  p_lines jsonb, p_supplier text default null, p_notes text default null,
  p_update_prices boolean default true, p_date timestamptz default now()
) returns merchant.purchases
language plpgsql security definer set search_path = '' as $$
declare v_p merchant.purchases; v_totals jsonb; x record; v_label text;
begin
  perform merchant._require(merchant.is_manager(), 'purchasing');
  insert into merchant.purchases (purchase_date, supplier, notes, created_by, created_by_name)
  values (coalesce(p_date, now()), nullif(btrim(p_supplier), ''), p_notes, merchant_auth.uid(), merchant._actor_name())
  returning * into v_p;
  v_label := format('Purchase #%s', v_p.purchase_no) || coalesce(' — ' || v_p.supplier, '');
  v_totals := merchant._write_purchase_lines(v_p.id, p_lines, p_update_prices);
  for x in select item_kind, coalesce(material_id, good_id) as item_id, sum(quantity) as qty
           from merchant.purchase_lines where purchase_id = v_p.id group by 1, 2 loop
    perform merchant._apply_stock(x.item_kind, x.item_id, x.qty, 'Purchase', v_label, 'purchase', v_p.id);
  end loop;
  return merchant._book_purchase(v_p.id, v_totals);
end $$;

create function merchant.update_purchase(
  p_purchase uuid, p_lines jsonb, p_supplier text default null, p_notes text default null, p_date timestamptz default null
) returns merchant.purchases
language plpgsql security definer set search_path = '' as $$
declare v_p merchant.purchases; v_totals jsonb; x record; v_label text;
begin
  perform merchant._require(merchant.is_manager(), 'editing purchases');
  select * into v_p from merchant.purchases where id = p_purchase for update;
  if not found then raise exception 'Purchase not found'; end if;

  create temp table _old_purchase_qty on commit drop as
    select item_kind, coalesce(material_id, good_id) as item_id, sum(quantity) as qty
    from merchant.purchase_lines where purchase_id = p_purchase group by 1, 2;

  update merchant.purchases
  set supplier = nullif(btrim(p_supplier), ''), notes = p_notes, purchase_date = coalesce(p_date, purchase_date)
  where id = p_purchase returning * into v_p;
  v_label := format('Purchase #%s edited', v_p.purchase_no) || coalesce(' — ' || v_p.supplier, '');
  v_totals := merchant._write_purchase_lines(p_purchase, p_lines, false);

  -- Book only the difference per item, so already-used stock doesn't block the edit.
  for x in
    select coalesce(n.item_kind, o.item_kind) as kind, coalesce(n.item_id, o.item_id) as item_id,
           coalesce(n.qty, 0) - coalesce(o.qty, 0) as delta
    from (select item_kind, coalesce(material_id, good_id) as item_id, sum(quantity) as qty
          from merchant.purchase_lines where purchase_id = p_purchase group by 1, 2) n
    full join _old_purchase_qty o on o.item_kind = n.item_kind and o.item_id = n.item_id
  loop
    if abs(x.delta) > 1e-9 then
      perform merchant._apply_stock(x.kind, x.item_id, x.delta,
        case when x.delta > 0 then 'Purchase'::merchant.stock_reason else 'Correction'::merchant.stock_reason end,
        v_label, 'purchase', p_purchase);
    end if;
  end loop;
  drop table _old_purchase_qty;
  return merchant._book_purchase(p_purchase, v_totals);
end $$;

-- What would selling p_qty of a good use? -------------------------------------
create function merchant.good_sale_preview(p_good uuid, p_qty double precision default 1)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_details jsonb; v_avail double precision;
begin
  perform merchant._require(merchant.is_staff(), 'selling');
  if p_qty is null or p_qty <= 0 then p_qty := 1; end if;
  v_avail := merchant._available('good', p_good);
  v_details := merchant._plan_details(merchant._resolve_consumption(
    jsonb_build_array(jsonb_build_object('good_id', p_good, 'qty', p_qty)), true));
  return jsonb_build_object(
    'qty', p_qty,
    'stock', (select stock from merchant.goods where id = p_good),
    'available', v_avail,
    'reserved', merchant._reserved('good', p_good),
    'from_stock', v_avail >= p_qty - 1e-9,
    'has_recipe', exists (select 1 from merchant.recipe_components where good_id = p_good),
    'ok', merchant._missing_text(v_details) is null,
    'missing_text', merchant._missing_text(v_details),
    'lines', v_details);
end $$;

revoke execute on function merchant._write_purchase_lines(uuid, jsonb, boolean), merchant._book_purchase(uuid, jsonb)
  from public, merchant_app;
revoke execute on function merchant.unpost_sale(uuid), merchant.update_purchase(uuid, jsonb, text, text, timestamptz),
  merchant.good_sale_preview(uuid, double precision) from public;
grant execute on function merchant.unpost_sale(uuid), merchant.update_purchase(uuid, jsonb, text, text, timestamptz),
  merchant.good_sale_preview(uuid, double precision) to merchant_app;
