-- 2026-11-03 (owner): quota pay stops at the weekly target. Crafting 120 ingots with a target of
-- 20 pays 20 × rate; the rest still counts as crafted (and goes to stock) but isn't paid.
-- Items without a target are paid for every piece.

-- Paid pieces per employee × item × week (time zone of the viewer).
create or replace function merchant._quota_pay(p_tz text)
returns table (pid uuid, wk date, good_id uuid, crafted double precision, paid_qty double precision, amount double precision)
language sql stable set search_path = '' as $$
  select c.pid, merchant._week_start(c.crafted_at, p_tz), c.good_id, sum(c.qty),
         least(sum(c.qty), coalesce(q.weekly_target, sum(c.qty))),
         round((least(sum(c.qty), coalesce(q.weekly_target, sum(c.qty))) * q.rate)::numeric, 2)::double precision
  from merchant._quota_credits() c
  join merchant.quota_items q on q.good_id = c.good_id
  group by c.pid, merchant._week_start(c.crafted_at, p_tz), c.good_id, q.weekly_target, q.rate
$$;
revoke execute on function merchant._quota_pay(text) from public, merchant_app;

drop function if exists merchant.quota_week(date, text);
create function merchant.quota_week(p_week date, p_tz text default 'UTC')
returns table (person_id uuid, name text, rank text, good_id uuid, good_name text,
               rate double precision, weekly_target double precision, crafted double precision,
               paid_qty double precision, earned double precision)
language sql stable security definer set search_path = '' as $$
  with c as (select * from merchant._quota_pay(p_tz) where wk = p_week)
  select p.id, coalesce(p.display_name, p.username), p.rank, g.id, g.name,
         qi.rate, qi.weekly_target, coalesce(c.crafted, 0), coalesce(c.paid_qty, 0), coalesce(c.amount, 0)
  from merchant.profiles p
  cross join merchant.quota_items qi
  join merchant.goods g on g.id = qi.good_id
  left join c on c.pid = p.id and c.good_id = qi.good_id
  where p.rank is not null
    and (merchant.is_manager() or (merchant.is_staff() and p.id = merchant_auth.uid()))
  order by 2, 5
$$;

create or replace function merchant.payout_week(p_week date, p_tz text default 'UTC')
returns table (person_id uuid, name text, earned double precision, paid double precision,
               owed double precision, settled boolean, receipts bigint, last_paid_at timestamptz,
               sales_earned double precision, quota_earned double precision)
language sql stable security definer set search_path = '' as $$
  with s as (
    select c.pid, sum(c.amount) as amount, count(distinct c.sale_id) as receipts
    from merchant._payout_credits() c
    where c.sale_date >= (p_week::timestamp at time zone p_tz)
      and c.sale_date < ((p_week + 7)::timestamp at time zone p_tz)
    group by c.pid
  ), q as (
    select c.pid, sum(c.amount) as amount
    from merchant._quota_pay(p_tz) c
    where c.wk = p_week
    group by c.pid
    having sum(c.amount) > 0
  ), pd as (
    select beneficiary_id as pid, sum(money_out) as paid, max(entry_date) as last_paid_at
    from merchant.treasury_entries
    where ref_type = 'payout' and payout_week = p_week and beneficiary_id is not null
    group by beneficiary_id
  ), e as (
    select p.id as pid,
           round(coalesce(s.amount, 0)::numeric, 2)::double precision as sales_earned,
           round(coalesce(q.amount, 0)::numeric, 2)::double precision as quota_earned,
           coalesce(s.receipts, 0) as receipts,
           s.pid is not null or q.pid is not null as has_earned
    from merchant.profiles p left join s on s.pid = p.id left join q on q.pid = p.id
  )
  select p.id, coalesce(p.display_name, p.username),
         e.sales_earned + e.quota_earned,
         coalesce(pd.paid, 0),
         case when pd.pid is not null then 0 else e.sales_earned + e.quota_earned end,
         pd.pid is not null, e.receipts, pd.last_paid_at,
         e.sales_earned, e.quota_earned
  from merchant.profiles p
  join e on e.pid = p.id
  left join pd on pd.pid = p.id
  where (e.has_earned or pd.pid is not null)
    and (merchant.is_manager() or (merchant.is_staff() and p.id = merchant_auth.uid()))
  order by 5 desc, 3 desc, 2
$$;

create or replace function merchant.payout_weeks(p_tz text default 'UTC', p_limit int default 26)
returns table (week date, earned double precision, paid double precision, owed double precision, unpaid int)
language sql stable security definer set search_path = '' as $$
  with x as (
    select c.pid, merchant._week_start(c.sale_date, p_tz) as wk, c.amount as earned, 0::double precision as paid, 0 as n
    from merchant._payout_credits() c
    union all
    select c.pid, c.wk, c.amount, 0, 0
    from merchant._quota_pay(p_tz) c
    union all
    select beneficiary_id, payout_week, 0, money_out, 1
    from merchant.treasury_entries
    where ref_type = 'payout' and payout_week is not null and beneficiary_id is not null
  ), per as (
    select pid, wk, sum(earned) as earned, sum(paid) as paid, sum(n) as n
    from x
    where merchant.is_manager() or (merchant.is_staff() and pid = merchant_auth.uid())
    group by pid, wk
  )
  select wk,
         round(sum(earned)::numeric, 2)::double precision,
         round(sum(paid)::numeric, 2)::double precision,
         round(sum(case when n > 0 then 0 else earned end)::numeric, 2)::double precision,
         (count(*) filter (where n = 0 and earned > 0))::int
  from per
  group by wk
  order by wk desc
  limit p_limit
$$;

revoke execute on function merchant.quota_week(date, text) from public;
grant execute on function merchant.quota_week(date, text) to merchant_app;
