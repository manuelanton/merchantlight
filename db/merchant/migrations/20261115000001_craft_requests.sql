-- Merchantlight — craft requests, like the Tavern's cooking requests. A manager asks for an item,
-- crafters see it on the Craft page, and crafting that item counts toward the oldest open request
-- by itself. Deleting a craft takes its progress back. Requests earn nobody a commission.

create table merchant.craft_requests (
  id           uuid primary key default gen_random_uuid(),
  good_id      uuid not null references merchant.goods (id) on delete cascade,
  quantity     double precision not null check (quantity > 0),
  fulfilled    double precision not null default 0 check (fulfilled >= 0),
  note         text not null default '',
  status       text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  requested_by uuid references merchant.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index craft_requests_open_idx on merchant.craft_requests (good_id, created_at) where status = 'open';

-- Which craft moved which request, so that deleting the craft can undo exactly that.
create table merchant.craft_request_progress (
  craft_id   uuid not null references merchant.crafts (id) on delete cascade,
  request_id uuid not null references merchant.craft_requests (id) on delete cascade,
  quantity   double precision not null check (quantity > 0),
  primary key (craft_id, request_id)
);

alter table merchant.craft_requests enable row level security;
alter table merchant.craft_request_progress enable row level security;
grant select on merchant.craft_requests to merchant_app;
create policy craft_requests_select on merchant.craft_requests for select to merchant_app
  using ((select merchant.is_staff()));

create function merchant.request_craft(p_good uuid, p_qty double precision, p_note text default '')
returns merchant.craft_requests
language plpgsql security definer set search_path = '' as $$
declare r merchant.craft_requests;
begin
  perform merchant._require(merchant.is_manager(), 'requesting a craft');
  if coalesce(p_qty, 0) <= 0 then raise exception 'The amount must be above zero' using errcode = 'P0001'; end if;
  if not exists (select 1 from merchant.goods g where g.id = p_good and g.active
                 and exists (select 1 from merchant.recipe_components c where c.good_id = g.id)) then
    raise exception 'Pick an item with a recipe' using errcode = 'P0001';
  end if;
  insert into merchant.craft_requests (good_id, quantity, note, requested_by)
  values (p_good, p_qty, coalesce(btrim(p_note), ''), merchant_auth.uid())
  returning * into r;
  return r;
end $$;

create function merchant.cancel_craft_request(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform merchant._require(merchant.is_manager(), 'cancelling a craft request');
  update merchant.craft_requests set status = 'cancelled', completed_at = now() where id = p_id and status = 'open';
  if not found then raise exception 'This request is not open any more' using errcode = 'P0001'; end if;
end $$;

create function merchant._craft_fills_requests() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r merchant.craft_requests;
  v_left double precision := new.quantity;
  v_take double precision;
begin
  for r in
    select * from merchant.craft_requests
    where good_id = new.good_id and status = 'open' order by created_at for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.quantity - r.fulfilled);
    update merchant.craft_requests
    set fulfilled = fulfilled + v_take,
        status = case when fulfilled + v_take >= quantity - 0.000001 then 'done' else 'open' end,
        completed_at = case when fulfilled + v_take >= quantity - 0.000001 then now() end
    where id = r.id;
    insert into merchant.craft_request_progress (craft_id, request_id, quantity) values (new.id, r.id, v_take);
    v_left := v_left - v_take;
  end loop;
  return null;
end $$;

create function merchant._craft_undoes_requests() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update merchant.craft_requests q
  set fulfilled = greatest(q.fulfilled - p.quantity, 0),
      status = case when q.status = 'done' then 'open' else q.status end,
      completed_at = case when q.status = 'done' then null else q.completed_at end
  from merchant.craft_request_progress p
  where p.craft_id = old.id and p.request_id = q.id;
  return old;
end $$;

create trigger crafts_fill_requests after insert on merchant.crafts
  for each row execute function merchant._craft_fills_requests();
create trigger crafts_undo_requests before delete on merchant.crafts
  for each row execute function merchant._craft_undoes_requests();

revoke execute on function merchant._craft_fills_requests(), merchant._craft_undoes_requests() from public;
revoke execute on function merchant.request_craft(uuid, double precision, text), merchant.cancel_craft_request(uuid) from public;
grant execute on function merchant.request_craft(uuid, double precision, text), merchant.cancel_craft_request(uuid) to merchant_app;
