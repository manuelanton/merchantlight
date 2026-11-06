-- Merchantlight — ledgers: stock movement audit log + treasury (Kassenbuch)
--
-- Every business document (sale, purchase, craft, rental) tags the stock
-- movements and treasury entries it creates with (ref_type, ref_id).
-- merchant._reverse_ref() is the ONE place that undoes a document: it books
-- compensating stock movements and removes the linked treasury entries
-- (sales income, commission, purchase cost, rental income, ...).

create type merchant.stock_reason as enum ('Purchase', 'Production', 'Sale', 'Correction', 'Waste', 'Event');

-- Append-only: clients get SELECT only; rows are written by security-definer functions.
create table merchant.stock_movements (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  material_id uuid references merchant.materials (id) on delete set null,
  good_id     uuid references merchant.goods (id) on delete set null,
  item_kind   text not null check (item_kind in ('material', 'good')),
  item_name   text not null,
  delta       double precision not null check (delta <> 0),
  stock_after double precision not null,
  reason      merchant.stock_reason not null,
  note        text,
  ref_type    text,
  ref_id      uuid,
  reverses_id bigint references merchant.stock_movements (id),
  actor_id    uuid references merchant.profiles (id) on delete set null,
  actor_name  text
);
create index stock_movements_created_idx on merchant.stock_movements (created_at desc);
create index stock_movements_ref_idx on merchant.stock_movements (ref_type, ref_id);
create index stock_movements_material_idx on merchant.stock_movements (material_id);
create index stock_movements_good_idx on merchant.stock_movements (good_id);

-- Single entry point for stock changes. Locks the row, refuses to go negative.
create function merchant._apply_stock(
  p_kind text, p_id uuid, p_delta double precision, p_reason merchant.stock_reason,
  p_note text, p_ref_type text, p_ref_id uuid, p_reverses bigint default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_stock double precision;
  v_name  text;
  v_after double precision;
  v_id    bigint;
begin
  if p_delta is null or p_delta = 0 then return null; end if;

  if p_kind = 'material' then
    select stock, name into v_stock, v_name from merchant.materials where id = p_id for update;
  elsif p_kind = 'good' then
    select stock, name into v_stock, v_name from merchant.goods where id = p_id for update;
  else
    raise exception 'Unknown item kind %', p_kind;
  end if;
  if not found then raise exception '% % not found', p_kind, p_id; end if;

  v_after := round((v_stock + p_delta)::numeric, 6)::double precision;
  if v_after < 0 then
    raise exception 'Not enough stock of "%": have %, need %',
      v_name, trim_scale(round(v_stock::numeric, 3)), trim_scale(round((-p_delta)::numeric, 3))
      using errcode = 'P0001';
  end if;

  if p_kind = 'material' then
    update merchant.materials set stock = v_after where id = p_id;
  else
    update merchant.goods set stock = v_after where id = p_id;
  end if;

  insert into merchant.stock_movements (
    material_id, good_id, item_kind, item_name, delta, stock_after, reason, note,
    ref_type, ref_id, reverses_id, actor_id, actor_name)
  values (
    case when p_kind = 'material' then p_id end,
    case when p_kind = 'good' then p_id end,
    p_kind, v_name, p_delta, v_after, p_reason, p_note,
    p_ref_type, p_ref_id, p_reverses, merchant_auth.uid(), merchant._actor_name())
  returning id into v_id;
  return v_id;
end $$;

-- Manual correction / waste / event booking (Manager + Owner).
create function merchant.adjust_stock(
  p_kind text, p_id uuid, p_delta double precision, p_reason merchant.stock_reason, p_note text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  perform merchant._require(merchant.is_manager(), 'stock corrections');
  if p_reason not in ('Correction', 'Waste', 'Event') then
    raise exception 'Use Purchase / Craft / Sale for reason %', p_reason;
  end if;
  return merchant._apply_stock(p_kind, p_id, p_delta, p_reason, p_note, null, null);
end $$;

-- Treasury --------------------------------------------------------------------

create table merchant.treasury_categories (
  name       text primary key check (btrim(name) <> ''),
  direction  text not null default 'both' check (direction in ('in', 'out', 'both')),
  is_system  boolean not null default false,
  sort_order int not null default 100
);

insert into merchant.treasury_categories (name, direction, is_system, sort_order) values
  ('Sales income',      'in',   true,  10),
  ('Rental income',     'in',   true,  20),
  ('Commission',        'out',  true,  30),
  ('Material purchase', 'out',  true,  40),
  ('Goods purchase',    'out',  true,  50),
  ('Wages',             'out',  false, 60),
  ('Rent',              'out',  false, 70),
  ('Tools & upkeep',    'out',  false, 80),
  ('Deposit',           'in',   false, 90),
  ('Withdrawal',        'out',  false, 95),
  ('Other',             'both', false, 99);

create table merchant.treasury_entries (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  entry_date      timestamptz not null default now(),
  category        text not null references merchant.treasury_categories (name) on update cascade,
  description     text,
  money_in        double precision not null default 0 check (money_in >= 0),
  money_out       double precision not null default 0 check (money_out >= 0),
  -- Who receives the money (commission, wages) — used for "commission per employee".
  beneficiary_id  uuid references merchant.profiles (id) on delete set null,
  beneficiary_name text,
  ref_type        text,
  ref_id          uuid,
  created_by      uuid references merchant.profiles (id) on delete set null default merchant_auth.uid(),
  created_by_name text,
  constraint treasury_entry_nonzero check (money_in > 0 or money_out > 0)
);
create index treasury_entries_date_idx on merchant.treasury_entries (entry_date desc);
create index treasury_entries_ref_idx on merchant.treasury_entries (ref_type, ref_id);

create function merchant._stamp_treasury_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := merchant_auth.uid();
    new.created_by_name := merchant._actor_name();
  end if;
  if new.beneficiary_id is not null then
    new.beneficiary_name := (select coalesce(display_name, username) from merchant.profiles where id = new.beneficiary_id);
  else
    new.beneficiary_name := null;
  end if;
  return new;
end $$;

create trigger treasury_entries_stamp before insert or update on merchant.treasury_entries
  for each row execute function merchant._stamp_treasury_entry();

create function merchant._book(
  p_category text, p_in double precision, p_out double precision, p_description text,
  p_ref_type text, p_ref_id uuid, p_beneficiary uuid default null, p_date timestamptz default now()
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(p_in, 0) = 0 and coalesce(p_out, 0) = 0 then return; end if;
  insert into merchant.treasury_entries (entry_date, category, description, money_in, money_out, beneficiary_id, ref_type, ref_id)
  values (p_date, p_category, p_description,
          round(coalesce(p_in, 0)::numeric, 2)::double precision,
          round(coalesce(p_out, 0)::numeric, 2)::double precision,
          p_beneficiary, p_ref_type, p_ref_id);
end $$;

create function merchant.treasury_balance() returns double precision
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(money_in - money_out), 0) from merchant.treasury_entries
  where merchant.is_manager()
$$;

-- Central reversal ------------------------------------------------------------

create function merchant._reverse_ref(p_ref_type text, p_ref_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  for m in
    select sm.* from merchant.stock_movements sm
    where sm.ref_type = p_ref_type and sm.ref_id = p_ref_id
      and sm.reverses_id is null
      and not exists (select 1 from merchant.stock_movements r where r.reverses_id = sm.id)
    order by sm.id desc
  loop
    if coalesce(m.material_id, m.good_id) is not null then
      perform merchant._apply_stock(m.item_kind, coalesce(m.material_id, m.good_id), -m.delta,
                                  'Correction', p_note, p_ref_type, p_ref_id, m.id);
    end if;
  end loop;

  delete from merchant.treasury_entries where ref_type = p_ref_type and ref_id = p_ref_id;
end $$;

-- Generic BEFORE DELETE trigger: tg_argv[0] = ref_type, tg_argv[1] = label.
-- Sales only have side effects once posted.
create function merchant._reverse_on_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := to_jsonb(old);
begin
  if tg_argv[0] = 'sale' and v_row ->> 'status' <> 'posted' then
    return old;
  end if;
  perform merchant._reverse_ref(tg_argv[0], old.id,
    format('Reversal: %s deleted', coalesce(tg_argv[1], tg_argv[0])) ||
    coalesce(' #' || coalesce(v_row ->> 'receipt_no', v_row ->> 'purchase_no'), ''));
  return old;
end $$;
