-- Commission model change (owner, 2026-09-25):
--   profit     = net revenue (after discount, before tip) − material cost
--   merchant keeps `company_share` (default 10 %) of the profit,
--   the selling employee gets the rest as commission.
-- Negative profit → no commission (the merchant carries the loss).
-- The setting keeps its value (0.10) and grants; only its meaning/name change.

alter table merchant.settings rename column commission_rate to company_share;
alter table merchant.settings rename constraint settings_commission_rate_check to settings_company_share_check;
alter table merchant.sales rename column commission_rate to company_share;

comment on column merchant.settings.company_share is 'Share of each receipt''s profit that stays with the merchant; the seller gets the rest.';
comment on column merchant.sales.company_share is 'company_share snapshot at posting time.';

create function merchant._employee_commission(p_net double precision, p_cost double precision, p_company_share double precision)
returns double precision
language sql immutable set search_path = '' as $$
  select round((greatest(p_net - coalesce(p_cost, 0), 0) * (1 - p_company_share))::numeric, 2)::double precision
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
    format('Profit share for %s (%s%% of profit, merchant keeps %s%%) — %s',
      s.seller_name, trim_scale(round(((1 - v_share) * 100)::numeric, 2)),
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

revoke execute on function merchant._employee_commission(double precision, double precision, double precision) from public, merchant_app;
