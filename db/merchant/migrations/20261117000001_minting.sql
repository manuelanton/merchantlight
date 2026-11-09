-- Merchantlight — minting. Gold and Silver Ingots go to the mint and come back as septims,
-- usually 30 a bar. It isn't a sale and doesn't show under Sales, but for the profit it counts
-- like one: the septims are sales income in the partner split, and Analytics counts the ingots'
-- cost against them. Deleting a minting puts the ingots back and takes the septims out again.

alter type merchant.stock_reason add value if not exists 'Mint';

-- Which materials can be minted, and what the mint usually pays for one.
alter table merchant.materials add column mint_rate double precision check (mint_rate > 0);
grant insert (mint_rate), update (mint_rate) on merchant.materials to merchant_app;
update merchant.materials set mint_rate = 30 where name in ('Gold Ingot', 'Silver Ingot');

insert into merchant.treasury_categories (name, direction, is_system, sort_order)
values ('Minting', 'in', true, 15)
on conflict (name) do update set is_system = true;

create table merchant.mints (
  id            uuid primary key default gen_random_uuid(),
  mint_no       bigint generated always as identity unique,
  mint_date     timestamptz not null default now(),
  material_id   uuid references merchant.materials (id) on delete set null,
  material_name text not null,
  quantity      double precision not null check (quantity > 0),
  rate          double precision not null check (rate > 0),
  amount        double precision not null,
  cost_total    double precision not null default 0,
  note          text not null default '',
  minted_by     uuid references merchant.profiles (id) on delete set null default merchant_auth.uid(),
  created_at    timestamptz not null default now()
);
create index mints_date_idx on merchant.mints (mint_date desc);

alter table merchant.mints enable row level security;
grant select on merchant.mints to merchant_app;
create policy mints_select on merchant.mints for select to merchant_app using ((select merchant.is_staff()));

create function merchant.mint(
  p_material uuid, p_quantity double precision, p_rate double precision default null,
  p_note text default '', p_date timestamptz default null
) returns merchant.mints
language plpgsql security definer set search_path = '' as $$
declare
  m merchant.materials;
  r merchant.mints;
  v_rate double precision;
begin
  perform merchant._require(merchant.is_staff(), 'minting');
  select * into m from merchant.materials where id = p_material and active;
  if not found or m.mint_rate is null then
    raise exception 'Only Gold and Silver Ingots can be minted' using errcode = 'P0001';
  end if;
  if coalesce(p_quantity, 0) <= 0 or p_quantity <> floor(p_quantity) then
    raise exception 'Mint a whole number of ingots' using errcode = 'P0001';
  end if;
  v_rate := coalesce(p_rate, m.mint_rate);
  if v_rate <= 0 then raise exception 'The rate must be above zero' using errcode = 'P0001'; end if;
  if p_date is not null and not merchant.is_manager() then
    raise exception 'Only Managers can date a minting back' using errcode = 'P0001';
  end if;

  insert into merchant.mints (mint_date, material_id, material_name, quantity, rate, amount, cost_total, note)
  values (coalesce(p_date, now()), m.id, m.name, p_quantity, v_rate,
          round((p_quantity * v_rate)::numeric, 2)::double precision,
          round((p_quantity * m.buy_price)::numeric, 2)::double precision,
          coalesce(btrim(p_note), ''))
  returning * into r;

  perform merchant._apply_stock('material', m.id, -p_quantity, 'Mint', format('Minting #%s', r.mint_no), 'mint', r.id);
  perform merchant._book('Minting', r.amount, 0, format('Minting #%s — %s × %s', r.mint_no, r.quantity, r.material_name),
                         'mint', r.id, null, r.mint_date);
  return r;
end $$;

-- Managers may take back any minting, staff their own from the last day.
create function merchant.delete_mint(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r merchant.mints;
begin
  perform merchant._require(merchant.is_staff(), 'minting');
  select * into r from merchant.mints where id = p_id for update;
  if not found then raise exception 'Minting not found' using errcode = 'P0001'; end if;
  if not merchant.is_manager() and (r.minted_by is distinct from merchant_auth.uid() or r.created_at < now() - interval '1 day') then
    raise exception 'Not allowed: only a Manager can delete this minting' using errcode = '42501';
  end if;
  perform merchant._reverse_ref('mint', r.id, format('Minting #%s deleted', r.mint_no));
  delete from merchant.mints where id = p_id;
end $$;

-- Septims from the mint are sales income in the split, never other income.
create or replace function merchant._partner_figures(
  p_week date,
  out sales_income double precision, out other_income double precision,
  out expenses double precision, out net double precision
)
language sql stable security definer set search_path = '' as $$
  with s as (
    select coalesce((select sum(net_total) from merchant.sales
                     where status = 'posted' and (sale_date at time zone 'UTC')::date >= p_week
                       and (sale_date at time zone 'UTC')::date < p_week + 7), 0)
         + coalesce((select sum(amount) from merchant.mints
                     where (mint_date at time zone 'UTC')::date >= p_week
                       and (mint_date at time zone 'UTC')::date < p_week + 7), 0) as income
  ), t as (
    select coalesce(sum(money_in) filter (where category not in ('Sales income', 'Minting', 'Deposit', 'Other')), 0) as income,
           coalesce(sum(money_out) filter (where category not in ('Withdrawal', 'Partner payout', 'Other')), 0) as spent
    from merchant.treasury_entries
    where (entry_date at time zone 'UTC')::date >= p_week
      and (entry_date at time zone 'UTC')::date < p_week + 7
  )
  select round(s.income::numeric, 2)::double precision, t.income, t.spent,
         round((s.income + t.income - t.spent)::numeric, 2)::double precision
  from s, t
$$;

revoke execute on function merchant.mint(uuid, double precision, double precision, text, timestamptz), merchant.delete_mint(uuid) from public;
grant execute on function merchant.mint(uuid, double precision, double precision, text, timestamptz), merchant.delete_mint(uuid) to merchant_app;
