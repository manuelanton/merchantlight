-- 2026-10-18 (owner): payouts work in weeks that reset every Friday (pay day).
--  * A week runs Friday 00:00 → Thursday 23:59 in the viewer's time zone (passed in as p_tz).
--  * Earned in a week = line payouts of receipts whose sale date falls in that week.
--  * Every payment belongs to one week (treasury_entries.payout_week = that Friday). Once a employee
--    has a payment for a week, that week is settled for them: owed = 0, whatever amount was
--    actually handed over (it can differ from what was earned and can be edited later).
--  * Commission and Wages payments both count — they are the same thing here.
--  * Weeks don't carry over: "owed" overall = last week + this week, unsettled.

alter table merchant.treasury_entries add column if not exists payout_week date;

-- Friday that starts the week of p_ts in time zone p_tz.
create or replace function merchant._week_start(p_ts timestamptz, p_tz text)
returns date language sql stable set search_path = '' as $$
  select d - ((extract(isodow from d)::int + 2) % 7) from (select (p_ts at time zone p_tz)::date as d) x
$$;

-- Existing payments were made on/after pay day for the week before.
update merchant.treasury_entries
set payout_week = merchant._week_start(entry_date, 'UTC') - 7
where ref_type = 'payout' and payout_week is null;

-- Who earned what on which receipt (line payouts go to the crafter, else the seller; receipts
-- posted before line payouts existed credit their whole commission to the seller).
create or replace function merchant._payout_credits()
returns table (pid uuid, amount double precision, sale_id uuid, sale_date timestamptz)
language sql stable set search_path = '' as $$
  select coalesce(l.crafted_by, s.seller_id), l.payout, s.id, s.sale_date
  from merchant.sales s join merchant.sale_lines l on l.sale_id = s.id
  where s.status = 'posted' and l.payout is not null
  union all
  select s.seller_id, coalesce(s.commission_amount, 0), s.id, s.sale_date
  from merchant.sales s
  where s.status = 'posted'
    and not exists (select 1 from merchant.sale_lines l where l.sale_id = s.id and l.payout is not null)
$$;
revoke execute on function merchant._payout_credits() from public, merchant_app;

-- One week, per employee.
create or replace function merchant.payout_week(p_week date, p_tz text default 'UTC')
returns table (person_id uuid, name text, earned double precision, paid double precision,
               owed double precision, settled boolean, receipts bigint, last_paid_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with e as (
    select c.pid, sum(c.amount) as earned, count(distinct c.sale_id) as receipts
    from merchant._payout_credits() c
    where c.sale_date >= (p_week::timestamp at time zone p_tz)
      and c.sale_date < ((p_week + 7)::timestamp at time zone p_tz)
    group by c.pid
  ), pd as (
    select beneficiary_id as pid, sum(money_out) as paid, max(entry_date) as last_paid_at
    from merchant.treasury_entries
    where ref_type = 'payout' and payout_week = p_week and beneficiary_id is not null
    group by beneficiary_id
  )
  select p.id, coalesce(p.display_name, p.username),
         round(coalesce(e.earned, 0)::numeric, 2)::double precision,
         coalesce(pd.paid, 0),
         case when pd.pid is not null then 0
              else round(coalesce(e.earned, 0)::numeric, 2)::double precision end,
         pd.pid is not null, coalesce(e.receipts, 0), pd.last_paid_at
  from merchant.profiles p
  left join e on e.pid = p.id
  left join pd on pd.pid = p.id
  where (e.pid is not null or pd.pid is not null)
    and (merchant.is_manager() or (merchant.is_staff() and p.id = merchant_auth.uid()))
  order by 5 desc, 3 desc, 2
$$;

-- Week list for the history: totals per week.
create or replace function merchant.payout_weeks(p_tz text default 'UTC', p_limit int default 26)
returns table (week date, earned double precision, paid double precision, owed double precision, unpaid int)
language sql stable security definer set search_path = '' as $$
  with x as (
    select c.pid, merchant._week_start(c.sale_date, p_tz) as wk, c.amount as earned, 0::double precision as paid, 0 as n
    from merchant._payout_credits() c
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

-- What is owed right now per employee: last week + this week, unsettled (weeks before don't carry).
create or replace function merchant.payouts_owed(p_tz text default 'UTC')
returns table (person_id uuid, name text, owed double precision, owed_last_week double precision, owed_this_week double precision)
language sql stable security definer set search_path = '' as $$
  with cur as (select merchant._week_start(now(), p_tz) as wk),
  rows as (
    select w.person_id, w.name, w.owed, 0::double precision as cur_owed from cur, merchant.payout_week(cur.wk - 7, p_tz) w
    union all
    select w.person_id, w.name, 0, w.owed from cur, merchant.payout_week(cur.wk, p_tz) w
  )
  select person_id, min(name), sum(owed) + sum(cur_owed), sum(owed), sum(cur_owed)
  from rows group by person_id
  order by 3 desc, 2
$$;

-- Pay a employee for a week (default: last week). Category kept for the treasury report.
drop function if exists merchant.record_payout(uuid, double precision, text, text);
create function merchant.record_payout(
  p_person uuid, p_amount double precision, p_note text default null, p_category text default 'Wages',
  p_week date default null
) returns merchant.treasury_entries
language plpgsql security definer set search_path = '' as $$
declare v merchant.treasury_entries; v_name text;
begin
  perform merchant._require(merchant.is_manager(), 'paying employees');
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_category not in ('Commission', 'Wages') then raise exception 'Category must be Commission or Wages'; end if;
  if p_week is not null and extract(isodow from p_week) <> 5 then raise exception 'A payout week starts on a Friday'; end if;
  select coalesce(display_name, username) into v_name from merchant.profiles where id = p_person;
  if v_name is null then raise exception 'Person not found'; end if;
  insert into merchant.treasury_entries (category, description, money_out, beneficiary_id, ref_type, payout_week)
  values (p_category,
          format('Payout to %s', v_name) || coalesce(' — ' || nullif(btrim(p_note), ''), ''),
          round(p_amount::numeric, 2)::double precision, p_person, 'payout',
          coalesce(p_week, merchant._week_start(now(), 'UTC') - 7))
  returning * into v;
  return v;
end $$;

-- Correct a payment: amount, note and week. Doesn't touch what was earned.
create or replace function merchant.update_payout(
  p_entry bigint, p_amount double precision, p_note text default null, p_week date default null
) returns merchant.treasury_entries
language plpgsql security definer set search_path = '' as $$
declare v merchant.treasury_entries; v_name text;
begin
  perform merchant._require(merchant.is_manager(), 'paying employees');
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_week is not null and extract(isodow from p_week) <> 5 then raise exception 'A payout week starts on a Friday'; end if;
  select coalesce(p.display_name, p.username) into v_name
  from merchant.treasury_entries t join merchant.profiles p on p.id = t.beneficiary_id
  where t.id = p_entry and t.ref_type = 'payout';
  update merchant.treasury_entries
  set money_out = round(p_amount::numeric, 2)::double precision,
      description = format('Payout to %s', coalesce(v_name, beneficiary_name, '?')) || coalesce(' — ' || nullif(btrim(p_note), ''), ''),
      payout_week = coalesce(p_week, payout_week)
  where id = p_entry and ref_type = 'payout'
  returning * into v;
  if v.id is null then raise exception 'Payout not found'; end if;
  return v;
end $$;

revoke execute on function merchant._week_start(timestamptz, text) from public;
grant execute on function merchant._week_start(timestamptz, text) to merchant_app;
revoke execute on function
  merchant.payout_week(date, text), merchant.payout_weeks(text, int), merchant.payouts_owed(text),
  merchant.record_payout(uuid, double precision, text, text, date), merchant.update_payout(bigint, double precision, text, date)
  from public;
grant execute on function
  merchant.payout_week(date, text), merchant.payout_weeks(text, int), merchant.payouts_owed(text),
  merchant.record_payout(uuid, double precision, text, text, date), merchant.update_payout(bigint, double precision, text, date)
  to merchant_app;
