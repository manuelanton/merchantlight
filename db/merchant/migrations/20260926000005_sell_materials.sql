-- 2026-09-26 (owner): employees can sell raw materials (ores etc.) on receipts.
-- A receipt line is now EITHER a good (incl. crafted materials like ingots) OR a raw material.
-- Raw materials are sold straight from stock; their cost is the buy price.

alter table merchant.materials add column sell_price double precision check (sell_price >= 0);
comment on column merchant.materials.sell_price is 'Price when sold on a receipt (null → the buy price is suggested).';
grant insert (sell_price), update (sell_price) on merchant.materials to merchant_app;


alter table merchant.sale_lines add column material_id uuid references merchant.materials (id) on delete set null;
alter table merchant.sale_lines add constraint sale_line_one_item check (good_id is null or material_id is null);
grant insert (material_id), update (material_id) on merchant.sale_lines to merchant_app;

create or replace function merchant._stamp_sale_line() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.good_id is not null then
    select g.name, g.category into new.good_name, new.category from merchant.goods g where g.id = new.good_id;
  elsif new.material_id is not null then
    select m.name, m.category into new.good_name, new.category from merchant.materials m where m.id = new.material_id;
  end if;
  return new;
end $$;

drop trigger sale_lines_stamp on merchant.sale_lines;
create trigger sale_lines_stamp before insert or update of good_id, material_id on merchant.sale_lines
  for each row execute function merchant._stamp_sale_line();

-- Everything a receipt takes from stock: goods (stock first, rest crafted) + raw materials.
create function merchant._sale_plan(p_sale uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'item_id', s.item_id, 'qty', s.qty)), '[]'::jsonb)
  from (
    select a.kind, a.item_id, sum(a.qty) as qty
    from (
      select x.kind, x.item_id, x.qty
      from jsonb_to_recordset(merchant._resolve_consumption(
             (select coalesce(jsonb_agg(jsonb_build_object('good_id', good_id, 'qty', quantity)), '[]'::jsonb)
              from merchant.sale_lines where sale_id = p_sale and good_id is not null), true))
           as x (kind text, item_id uuid, qty double precision)
      union all
      select 'material', material_id, quantity from merchant.sale_lines where sale_id = p_sale and material_id is not null
    ) a
    group by a.kind, a.item_id
  ) s
$$;

create function merchant._sale_line_cost(p_line merchant.sale_lines) returns double precision
language sql stable set search_path = '' as $$
  select case when p_line.material_id is not null
              then coalesce((select buy_price from merchant.materials where id = p_line.material_id), 0)
              else merchant._good_unit_cost(p_line.good_id) end
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

  select coalesce(sum(l.quantity * l.unit_price), 0),
         coalesce(sum(l.quantity * merchant._sale_line_cost(l)) filter (where l.good_id is not null or l.material_id is not null), 0)
    into v_sub, v_cost
  from merchant.sale_lines l where l.sale_id = p_sale;
  v_net := greatest(v_sub - s.discount, 0);
  select company_share into v_share from merchant.settings;
  v_comm := merchant._employee_commission(v_net, v_cost, v_share);
  v_details := merchant._plan_details(merchant._sale_plan(p_sale));
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
  if exists (select 1 from merchant.sale_lines where sale_id = p_sale and good_id is null and material_id is null) then
    raise exception 'Receipt #% references a deleted item', s.receipt_no using errcode = 'P0001';
  end if;

  select sum(quantity * unit_price) into v_sub from merchant.sale_lines where sale_id = p_sale;
  if s.discount > v_sub + 1e-9 then
    raise exception 'Discount (%) exceeds subtotal (%)', s.discount, v_sub using errcode = 'P0001';
  end if;
  v_net := round((v_sub - s.discount)::numeric, 2)::double precision;
  v_label := format('Receipt #%s', s.receipt_no);

  update merchant.sale_lines l set unit_cost = merchant._sale_line_cost(l) where l.sale_id = p_sale;
  select coalesce(sum(quantity * unit_cost), 0) into v_cost from merchant.sale_lines where sale_id = p_sale;

  select company_share into v_share from merchant.settings;
  v_comm := merchant._employee_commission(v_net, v_cost, v_share);

  perform merchant._execute_plan(merchant._sale_plan(p_sale), 'Sale', v_label, 'sale', p_sale);

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

revoke execute on function merchant._sale_plan(uuid), merchant._sale_line_cost(merchant.sale_lines) from public, merchant_app;
