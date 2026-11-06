-- Merchantlight — Other in and Other out (a starting deposit, say) move money without being
-- earned or spent by the store, so like Deposit and Withdrawal they stay out of the profit.
-- Closed weeks keep the figures they were closed with.

create or replace function merchant._partner_figures(
  p_week date,
  out sales_income double precision, out other_income double precision,
  out expenses double precision, out net double precision
)
language sql stable security definer set search_path = '' as $$
  with s as (
    select coalesce(sum(net_total), 0) as income
    from merchant.sales
    where status = 'posted' and (sale_date at time zone 'UTC')::date >= p_week
      and (sale_date at time zone 'UTC')::date < p_week + 7
  ), t as (
    select coalesce(sum(money_in) filter (where category not in ('Sales income', 'Deposit', 'Other')), 0) as income,
           coalesce(sum(money_out) filter (where category not in ('Withdrawal', 'Partner payout', 'Other')), 0) as spent
    from merchant.treasury_entries
    where (entry_date at time zone 'UTC')::date >= p_week
      and (entry_date at time zone 'UTC')::date < p_week + 7
  )
  select round(s.income::numeric, 2)::double precision, t.income, t.spent,
         round((s.income + t.income - t.spent)::numeric, 2)::double precision
  from s, t
$$;
