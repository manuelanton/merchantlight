-- 2026-09-29 (team request):
-- 1. reprice_goods(): set sell prices from the current recipe cost × markup (rounded like the
--    ledger: to the nearest 5). Sell prices never follow costs by themselves — after e.g. the
--    Malachite Ore price went 500 → 1000, all Glass items were still priced on the old cost.
-- 2. Recurring expenses (rent, the weekly charcoal allotment): due dates, "pay" books the
--    treasury entry (or a purchase that also adds stock) and moves the due date on.
-- 3. Payouts: a employee's payout is EARNED when a receipt is posted and PAID when a manager
--    records a payment. post_sale no longer books the payout out of the treasury right away;
--    record_payout() does, when the money is actually handed over. Payout entries booked by
--    posting before this change count as already paid.

-- 1. Repricing ------------------------------------------------------------------

create function merchant.reprice_goods(p_goods uuid[], p_markup double precision, p_round double precision default 5)
returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  perform merchant._require(merchant.is_manager(), 'changing prices');
  if p_markup is null or p_markup < -0.99 then raise exception 'Invalid markup'; end if;
  update merchant.goods g
  set sell_price = case when coalesce(p_round, 0) > 0
                        then round(merchant._good_unit_cost(g.id) * (1 + p_markup) / p_round) * p_round
                        else round((merchant._good_unit_cost(g.id) * (1 + p_markup))::numeric, 2)::double precision end
  where g.id = any (p_goods);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 2. Recurring expenses -----------------------------------------------------------

create table merchant.recurring_expenses (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (btrim(name) <> ''),
  -- plain expense: category + amount; purchase: purchase_lines (adds stock, category Material purchase)
  category       text references merchant.treasury_categories (name) on update cascade,
  amount         double precision not null default 0 check (amount >= 0),
  purchase_lines jsonb,
  supplier       text,
  interval_days  int not null default 7 check (interval_days > 0),
  next_due       date not null default current_date,
  notes          text,
  active         boolean not null default true,
  last_paid_at   timestamptz,
  created_by     uuid references merchant.profiles (id) on delete set null default merchant_auth.uid(),
  created_at     timestamptz not null default now(),
  constraint recurring_kind check ((purchase_lines is null) <> (category is null))
);

create function merchant.pay_recurring_expense(p_expense uuid, p_amount double precision default null)
returns merchant.recurring_expenses
language plpgsql security definer set search_path = '' as $$
declare e merchant.recurring_expenses; v_label text;
begin
  perform merchant._require(merchant.is_manager(), 'paying expenses');
  select * into e from merchant.recurring_expenses where id = p_expense for update;
  if not found then raise exception 'Expense not found'; end if;
  v_label := format('%s (due %s)', e.name, to_char(e.next_due, 'DD Mon'));

  if e.purchase_lines is not null then
    perform merchant.create_purchase(e.purchase_lines, coalesce(e.supplier, e.name), v_label, false, now());
  else
    perform merchant._book(e.category, 0, coalesce(p_amount, e.amount), v_label, 'recurring', e.id);
  end if;

  update merchant.recurring_expenses
  set next_due = next_due + interval_days, last_paid_at = now()
  where id = p_expense returning * into e;
  return e;
end $$;

create function merchant.skip_recurring_expense(p_expense uuid)
returns merchant.recurring_expenses
language plpgsql security definer set search_path = '' as $$
declare e merchant.recurring_expenses;
begin
  perform merchant._require(merchant.is_manager(), 'managing expenses');
  update merchant.recurring_expenses set next_due = next_due + interval_days
  where id = p_expense returning * into e;
  if not found then raise exception 'Expense not found'; end if;
  return e;
end $$;

alter table merchant.recurring_expenses enable row level security;
revoke all on merchant.recurring_expenses from merchant_app;
grant select, delete on merchant.recurring_expenses to merchant_app;
grant insert (name, category, amount, purchase_lines, supplier, interval_days, next_due, notes, active),
      update (name, category, amount, purchase_lines, supplier, interval_days, next_due, notes, active)
  on merchant.recurring_expenses to merchant_app;
create policy recurring_select on merchant.recurring_expenses for select to merchant_app using ((select merchant.is_manager()));
create policy recurring_insert on merchant.recurring_expenses for insert to merchant_app with check ((select merchant.is_manager()));
create policy recurring_update on merchant.recurring_expenses for update to merchant_app
  using ((select merchant.is_manager())) with check ((select merchant.is_manager()));
create policy recurring_delete on merchant.recurring_expenses for delete to merchant_app using ((select merchant.is_manager()));


-- 3. Payouts ----------------------------------------------------------------------

-- Posting no longer pays the employee out of the treasury (payout is only earned here).
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

  update merchant.sales set
    status = 'posted', subtotal = v_sub, net_total = v_net, cost_total = v_cost,
    company_share = v_share, commission_amount = v_comm,
    posted_at = now(), posted_by = merchant_auth.uid()
  where id = p_sale
  returning * into s;
  return s;
end $$;

-- Hand money to a employee (payout of earned commission, or wages): books it out of the treasury.
create function merchant.record_payout(
  p_person uuid, p_amount double precision, p_note text default null, p_category text default 'Commission'
) returns merchant.treasury_entries
language plpgsql security definer set search_path = '' as $$
declare v merchant.treasury_entries; v_name text;
begin
  perform merchant._require(merchant.is_manager(), 'paying employees');
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_category not in ('Commission', 'Wages') then raise exception 'Category must be Commission or Wages'; end if;
  select coalesce(display_name, username) into v_name from merchant.profiles where id = p_person;
  if v_name is null then raise exception 'Person not found'; end if;
  insert into merchant.treasury_entries (category, description, money_out, beneficiary_id, ref_type)
  values (p_category,
          format('%s to %s', case when p_category = 'Wages' then 'Wages' else 'Payout' end, v_name) || coalesce(' — ' || nullif(btrim(p_note), ''), ''),
          round(p_amount::numeric, 2)::double precision, p_person, 'payout')
  returning * into v;
  return v;
end $$;

create function merchant.delete_payout(p_entry bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform merchant._require(merchant.is_manager(), 'paying employees');
  delete from merchant.treasury_entries where id = p_entry and ref_type = 'payout';
  if not found then raise exception 'Payout not found'; end if;
end $$;

-- Earned vs paid per person. Employees only see their own row.
create function merchant.payout_summary()
returns table (person_id uuid, name text, earned double precision, paid double precision,
               owed double precision, wages double precision, receipts bigint, last_paid_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with earned as (
    select seller_id as pid, sum(coalesce(commission_amount, 0)) as earned, count(*) as receipts
    from merchant.sales where status = 'posted' group by seller_id
  ), paid as (
    select beneficiary_id as pid,
           sum(money_out) filter (where category = 'Commission') as paid,
           sum(money_out) filter (where category = 'Wages' and ref_type = 'payout') as wages,
           max(entry_date) filter (where ref_type = 'payout') as last_paid_at
    from merchant.treasury_entries
    where beneficiary_id is not null and ((category = 'Commission' and ref_type in ('sale', 'payout'))
                                          or (category = 'Wages' and ref_type = 'payout'))
    group by beneficiary_id
  )
  select p.id, coalesce(p.display_name, p.username),
         coalesce(e.earned, 0), coalesce(pd.paid, 0),
         round((coalesce(e.earned, 0) - coalesce(pd.paid, 0))::numeric, 2)::double precision,
         coalesce(pd.wages, 0), coalesce(e.receipts, 0), pd.last_paid_at
  from merchant.profiles p
  left join earned e on e.pid = p.id
  left join paid pd on pd.pid = p.id
  where (e.pid is not null or pd.pid is not null)
    and (merchant.is_manager() or (merchant.is_staff() and p.id = merchant_auth.uid()))
  order by 5 desc, 2
$$;

revoke execute on function merchant.reprice_goods(uuid[], double precision, double precision),
  merchant.pay_recurring_expense(uuid, double precision), merchant.skip_recurring_expense(uuid),
  merchant.record_payout(uuid, double precision, text, text), merchant.delete_payout(bigint),
  merchant.payout_summary() from public;
grant execute on function merchant.reprice_goods(uuid[], double precision, double precision),
  merchant.pay_recurring_expense(uuid, double precision), merchant.skip_recurring_expense(uuid),
  merchant.record_payout(uuid, double precision, text, text), merchant.delete_payout(bigint),
  merchant.payout_summary() to merchant_app;

