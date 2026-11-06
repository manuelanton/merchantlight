-- 2026-09-30 (owner): the payouts post_sale used to book automatically ("Commission", ref_type
-- 'sale') were never actually handed to anyone. They are removed from the treasury (the money
-- never left it) and "paid" now only counts payments recorded with record_payout().
-- The removed rows are kept in a backup table so this can be undone.


create or replace function merchant.payout_summary()
returns table (person_id uuid, name text, earned double precision, paid double precision,
               owed double precision, wages double precision, receipts bigint, last_paid_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with earned as (
    select seller_id as pid, sum(coalesce(commission_amount, 0)) as earned, count(*) as receipts
    from merchant.sales where status = 'posted' group by seller_id
  ), paid as (
    select beneficiary_id as pid,
           sum(money_out) filter (where category = 'Commission') as paid,
           sum(money_out) filter (where category = 'Wages') as wages,
           max(entry_date) as last_paid_at
    from merchant.treasury_entries
    where beneficiary_id is not null and ref_type = 'payout'
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
