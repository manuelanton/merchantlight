-- Merchantlight — partner shares are whole gold, rounded down. What doesn't divide stays in the treasury.
-- Weeks already closed keep the shares they were closed with.

create or replace function merchant._partner_share(p_net double precision, p_partners int) returns double precision
language sql immutable set search_path = '' as $$
  select floor((p_net / p_partners)::numeric)::double precision
$$;
revoke all on function merchant._partner_share(double precision, int) from public;

create or replace function merchant.partner_week(p_week date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  w merchant.partner_weeks;
  f record;
  v_list jsonb;
  v_n int;
begin
  perform merchant._require(merchant.is_manager(), 'the partner split');
  select * into w from merchant.partner_weeks where week_start = p_week;
  if found then
    select jsonb_agg(jsonb_build_object('id', s.partner_id, 'name', s.partner_name, 'amount', s.amount) order by s.partner_name)
      into v_list from merchant.partner_shares s where s.week_start = p_week;
    return jsonb_build_object('week_start', p_week, 'closed', true, 'sales_income', w.sales_income,
      'other_income', w.other_income, 'expenses', w.expenses, 'net', w.net,
      'per_partner', w.per_partner, 'partners', coalesce(v_list, '[]'::jsonb));
  end if;
  select * into f from merchant._partner_figures(p_week);
  select count(*) into v_n from merchant._partners();
  select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)) into v_list from merchant._partners() p;
  return jsonb_build_object('week_start', p_week, 'closed', false, 'sales_income', f.sales_income,
    'other_income', f.other_income, 'expenses', f.expenses, 'net', f.net,
    'per_partner', case when v_n > 0 then merchant._partner_share(f.net, v_n) end,
    'partners', coalesce(v_list, '[]'::jsonb));
end $$;

create or replace function merchant.close_partner_week(p_week date) returns merchant.partner_weeks
language plpgsql security definer set search_path = '' as $$
declare
  f record;
  v_n int;
  v_each double precision;
  w merchant.partner_weeks;
begin
  perform merchant._require(merchant.is_manager(), 'closing a week');
  if extract(isodow from p_week) <> 1 then raise exception 'A week starts on a Monday' using errcode = 'P0001'; end if;
  if p_week + 7 > (now() at time zone 'UTC')::date then
    raise exception 'This week is not over yet' using errcode = 'P0001';
  end if;
  if exists (select 1 from merchant.partner_weeks where week_start = p_week) then
    raise exception 'This week is already closed' using errcode = 'P0001';
  end if;
  select count(*) into v_n from merchant._partners();
  if v_n = 0 then raise exception 'There is no Owner or Manager to share with' using errcode = 'P0001'; end if;

  select * into f from merchant._partner_figures(p_week);
  v_each := merchant._partner_share(f.net, v_n);
  insert into merchant.partner_weeks (week_start, sales_income, other_income, expenses, net, per_partner, closed_by)
  values (p_week, f.sales_income, f.other_income, f.expenses, f.net, v_each, merchant_auth.uid())
  returning * into w;
  insert into merchant.partner_shares (week_start, partner_id, partner_name, amount)
  select p_week, p.id, p.name, v_each from merchant._partners() p;
  return w;
end $$;
