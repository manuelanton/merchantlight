-- Merchantlight — a receipt with its lines in one transaction, so a failed line or a failed
-- posting leaves no half receipt. Runs as the caller: RLS decides who may sell for whom.

create function merchant.create_receipt(
  p_seller   uuid,
  p_customer text,
  p_discount double precision,
  p_tip      double precision,
  p_notes    text,
  p_lines    jsonb,
  p_post     boolean default false
) returns merchant.sales
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
  s    merchant.sales;
begin
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'A receipt needs at least one line' using errcode = 'P0001';
  end if;
  insert into merchant.sales (seller_id, customer, discount, tip, notes)
  values (p_seller, nullif(btrim(p_customer), ''), coalesce(p_discount, 0), coalesce(p_tip, 0), nullif(btrim(p_notes), ''))
  returning id into v_id;
  insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price)
  select v_id, x.good_id, x.qty, x.unit_price
  from jsonb_to_recordset(p_lines) as x (good_id uuid, qty double precision, unit_price double precision);
  if p_post then
    select * into s from merchant.post_sale(v_id);
  else
    select * into s from merchant.sales where id = v_id;
  end if;
  return s;
end $$;

revoke execute on function merchant.create_receipt(uuid, text, double precision, double precision, text, jsonb, boolean)
  from public;
grant execute on function merchant.create_receipt(uuid, text, double precision, double precision, text, jsonb, boolean)
  to merchant_app;

-- Like the Tavern: once posted, a receipt belongs to the books. Only managers reopen or delete it;
-- sellers keep their own drafts. (The Forge let sellers do both.)
drop policy sales_delete on merchant.sales;
create policy sales_delete on merchant.sales for delete to merchant_app
  using ((select merchant.is_manager()) or (status = 'draft' and merchant._can_edit_sale(sales)));

create or replace function merchant.unpost_sale(p_sale uuid)
returns merchant.sales
language plpgsql security definer set search_path = '' as $$
declare s merchant.sales;
begin
  select * into s from merchant.sales where id = p_sale for update;
  if not found then raise exception 'Receipt not found'; end if;
  perform merchant._require(merchant.is_manager(), 'reopening a posted receipt');
  if s.status <> 'posted' then raise exception 'Receipt #% is not posted', s.receipt_no; end if;

  perform merchant._reverse_ref('sale', p_sale, format('Receipt #%s reopened for editing', s.receipt_no));
  update merchant.sale_lines set unit_cost = null, payout = null where sale_id = p_sale;
  update merchant.sales set
    status = 'draft', subtotal = null, net_total = null, cost_total = null,
    company_share = null, employee_share = null, commission_amount = null, posted_at = null, posted_by = null
  where id = p_sale
  returning * into s;
  return s;
end $$;
