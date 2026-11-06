-- Merchantlight — what isn't paid out in a week moves on to the next one. Each week shows what was
-- carried in, its share, what was paid in it, and so what is owed. A finished week that was never
-- closed still counts, with the share it would close at, so nothing waits on the Close button.

-- Finished weeks before p_week with something to share that nobody closed yet.
create function merchant.partner_open_weeks(p_week date) returns setof date
language plpgsql stable security definer set search_path = '' as $$
declare v_first date;
begin
  perform merchant._require(merchant.is_manager(), 'the partner split');
  select date_trunc('week', min(d)::timestamp)::date into v_first from (
    select min((sale_date at time zone 'UTC')::date) as d from merchant.sales where status = 'posted'
    union all
    select min((entry_date at time zone 'UTC')::date) from merchant.treasury_entries
  ) x;
  if v_first is null then return; end if;
  return query
    select w::date
    from generate_series(v_first::timestamp, (p_week - 7)::timestamp, interval '7 days') w
    cross join lateral merchant._partner_figures(w::date) f
    where w::date + 7 <= (now() at time zone 'UTC')::date
      and f.net <> 0
      and not exists (select 1 from merchant.partner_weeks c where c.week_start = w::date)
    order by 1;
end $$;

create function merchant.partner_ledger(p_week date)
returns table (partner_id uuid, name text, carried double precision, share double precision, paid double precision)
language plpgsql stable security definer set search_path = '' as $$
declare v_n int;
begin
  perform merchant._require(merchant.is_manager(), 'the partner split');
  select count(*) into v_n from merchant._partners();
  return query
  with open_weeks as (
    select w as week from merchant.partner_open_weeks(p_week) w
    union
    select p_week where not exists (select 1 from merchant.partner_weeks c where c.week_start = p_week)
  ), moves as (
    select s.partner_id as pid, s.partner_name as pname, s.week_start as day, s.amount as earned, 0::double precision as spent
    from merchant.partner_shares s where s.week_start <= p_week
    union all
    select p.id, p.name, o.week, merchant._partner_share(f.net, v_n), 0
    from open_weeks o cross join lateral merchant._partner_figures(o.week) f cross join merchant._partners() p
    union all
    select p.id, p.name, p_week, 0, 0 from merchant._partners() p
    union all
    select t.beneficiary_id, null, (t.entry_date at time zone 'UTC')::date, 0, t.money_out
    from merchant.treasury_entries t
    where t.category = 'Partner payout' and t.beneficiary_id is not null
      and (t.entry_date at time zone 'UTC')::date < p_week + 7
  )
  select m.pid, coalesce(max(m.pname), max(pr.display_name), max(pr.username), 'Unknown'),
         round((coalesce(sum(m.earned - m.spent) filter (where m.day < p_week), 0))::numeric, 2)::double precision,
         round((coalesce(sum(m.earned) filter (where m.day >= p_week), 0))::numeric, 2)::double precision,
         round((coalesce(sum(m.spent) filter (where m.day >= p_week), 0))::numeric, 2)::double precision
  from moves m
  left join merchant.profiles pr on pr.id = m.pid
  group by m.pid
  order by 2;
end $$;

revoke execute on function merchant.partner_open_weeks(date), merchant.partner_ledger(date) from public;
grant execute on function merchant.partner_open_weeks(date), merchant.partner_ledger(date) to merchant_app;
