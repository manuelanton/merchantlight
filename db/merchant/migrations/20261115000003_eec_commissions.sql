-- Merchantlight — commissions: customers order what only the EEC sells, the store buys it for them.
-- eec_items is the list of buyable items from the Tailor License sheet, at its base import cost.
-- An order is one piece and keeps the name and price it was placed at.

create table merchant.eec_items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (btrim(name) <> ''),
  category     text not null,
  price        double precision not null check (price >= 0),
  weekly_limit int check (weekly_limit > 0),
  sort_order   int not null default 0
);

create table merchant.eec_orders (
  id         uuid primary key default gen_random_uuid(),
  order_no   bigint generated always as identity unique,
  customer   text not null check (btrim(customer) <> ''),
  item_id    uuid references merchant.eec_items (id) on delete set null,
  item_name  text not null,
  price      double precision not null,
  status     text not null default 'open' check (status in ('open', 'bought', 'delivered', 'cancelled')),
  order_date timestamptz not null default now(),
  created_by uuid references merchant.profiles (id) on delete set null
);
create index eec_orders_status_idx on merchant.eec_orders (status, order_date desc);

alter table merchant.eec_items enable row level security;
alter table merchant.eec_orders enable row level security;
grant select on merchant.eec_items, merchant.eec_orders to merchant_app;
create policy eec_items_select on merchant.eec_items for select to merchant_app using ((select merchant.is_staff()));
create policy eec_orders_select on merchant.eec_orders for select to merchant_app using ((select merchant.is_staff()));

-- Customers order without an account, through the server. Nobody signed in means a customer,
-- who gets a few open orders per name and shares a limit per hour.
create function merchant.place_eec_order(p_customer text, p_item uuid) returns merchant.eec_orders
language plpgsql security definer set search_path = '' as $$
declare
  v_item merchant.eec_items;
  v_name text := btrim(coalesce(p_customer, ''));
  v_user uuid := merchant_auth.uid();
  o merchant.eec_orders;
begin
  if v_name = '' then raise exception 'Please give your name' using errcode = 'P0001'; end if;
  if length(v_name) > 60 then raise exception 'That name is too long' using errcode = 'P0001'; end if;
  select * into v_item from merchant.eec_items where id = p_item for update;
  if not found then raise exception 'Pick an item from the list' using errcode = 'P0001'; end if;

  if v_item.weekly_limit is not null and (
    select count(*) from merchant.eec_orders
    where item_id = p_item and status <> 'cancelled'
      and order_date >= date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'
  ) >= v_item.weekly_limit then
    raise exception 'The EEC only sells % % a week, try again next week', v_item.weekly_limit, v_item.name using errcode = 'P0001';
  end if;

  if v_user is null then
    if (select count(*) from merchant.eec_orders where lower(customer) = lower(v_name) and status = 'open') >= 10 then
      raise exception 'You already have 10 open orders, please wait until they are bought' using errcode = 'P0001';
    end if;
    if (select count(*) from merchant.eec_orders where created_by is null and order_date > now() - interval '1 hour') >= 60 then
      raise exception 'Too many orders right now, please try again later' using errcode = 'P0001';
    end if;
  end if;

  insert into merchant.eec_orders (customer, item_id, item_name, price, created_by)
  values (v_name, p_item, v_item.name, v_item.price, v_user)
  returning * into o;
  return o;
end $$;

create function merchant.set_eec_order_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform merchant._require(merchant.is_staff(), 'changing a commission');
  if p_status not in ('open', 'bought', 'delivered', 'cancelled') then
    raise exception 'Unknown status' using errcode = 'P0001';
  end if;
  update merchant.eec_orders set status = p_status where id = p_id;
  if not found then raise exception 'Order not found' using errcode = 'P0001'; end if;
end $$;

revoke execute on function merchant.place_eec_order(text, uuid), merchant.set_eec_order_status(uuid, text) from public;
grant execute on function merchant.place_eec_order(text, uuid), merchant.set_eec_order_status(uuid, text) to merchant_app;

insert into merchant.eec_items (name, category, price, weekly_limit, sort_order) values
  ('Wedding Dress', 'Clothing', 2000, null, 1),
  ('Wedding Wreath', 'Clothing', 200, null, 2),
  ('Wedding Sandals', 'Clothing', 200, null, 3),
  ('Telvanni Robes', 'Clothing', 2000, null, 4),
  ('Telvanni Shoes', 'Clothing', 200, null, 5),
  ('Chef''s Tunic', 'Clothing', 200, null, 6),
  ('Chef''s Hat', 'Clothing', 20, null, 7),
  ('Fur-lined Boots', 'Clothing', 200, null, 8),
  ('Ulfric''s Clothes (Replica)', 'Clothing', 2000, null, 9),
  ('Ulfric''s Boots (Replica)', 'Clothing', 200, null, 10),
  ('Ulfric''s Bracers (Replica)', 'Clothing', 200, null, 11),
  ('Jester''s Hat', 'Clothing', 100, null, 12),
  ('Jester''s Clothes', 'Clothing', 1000, null, 13),
  ('Jester''s Gloves', 'Clothing', 100, null, 14),
  ('Jester''s Boots', 'Clothing', 100, null, 15),
  ('Skaal Boots', 'Clothing', 100, null, 16),
  ('Skaal Coat', 'Clothing', 1000, null, 17),
  ('Skaal Gloves', 'Clothing', 100, null, 18),
  ('Skaal Hat', 'Clothing', 100, null, 19),
  ('Noble Clothes', 'Clothing', 6000, null, 20),
  ('Fur-trimmed Cloak', 'Clothing', 2000, null, 21),
  ('Fine Raiment', 'Clothing', 7000, null, 22),
  ('Refined Tunic', 'Clothing', 4000, null, 23),
  ('Embroidered Garment', 'Clothing', 8000, null, 24),
  ('Embellished Robes', 'Clothing', 4000, null, 25),
  ('Torturer''s Hood', 'Clothing', 200, null, 26),
  ('Mourners Hat', 'Clothing', 4000, null, 27),
  ('Focusing Gloves', 'Clothing', 800, null, 28),
  ('Hand Wraps', 'Clothing', 200, null, 29),
  ('Pleated Shoes', 'Clothing', 200, null, 30),
  ('Cuffed Boots', 'Clothing', 200, null, 31),
  ('Gothic Style (Vampire) Clothes set', 'Clothing', 6000, null, 32),
  ('Exquisite Gothic Style (Royal Vampire) Clothes set', 'Clothing', 8000, null, 33),
  ('Nocturnal Robes', 'Clothing', 30000, null, 34),
  ('Bone Hawk Amulet (Replica)', 'Clothing', 800, null, 35),
  ('Bone Hawk Ring (Replica)', 'Clothing', 800, null, 36),
  ('Anequina Sunset Moon Monk Robes', 'Moon Monk Robes', 2000, null, 37),
  ('Armored Anequina Sunset Moon Monk Robes', 'Moon Monk Robes', 8000, null, 38),
  ('Assassin Moon Monk Robes', 'Moon Monk Robes', 2000, null, 39),
  ('Armored Assassin Moon Monk Robes', 'Moon Monk Robes', 8000, null, 40),
  ('Khenarthi''s Breath Moon Monk Robes', 'Moon Monk Robes', 2000, null, 41),
  ('Armored Khenarthi''s Breath Moon Monk Robes', 'Moon Monk Robes', 8000, null, 42),
  ('Nahfahlaar''s Flame Moon Monk Robes', 'Moon Monk Robes', 2000, null, 43),
  ('Armored Nahfahlaar''s Flame Moon Monk Robes', 'Moon Monk Robes', 8000, null, 44),
  ('Rahjin''s Shadow Moon Monk Robes', 'Moon Monk Robes', 2000, null, 45),
  ('Armored Rahjin''s Shadow Moon Monk Robes', 'Moon Monk Robes', 8000, null, 46),
  ('Ra''Kazra''s Might Moon Monk Robes', 'Moon Monk Robes', 2000, null, 47),
  ('Armored Ra''Kazra''s Might Moon Monk Robes', 'Moon Monk Robes', 8000, null, 48),
  ('Regal Moon Monk Robes', 'Moon Monk Robes', 2000, null, 49),
  ('Armored Regal Moon Monk Robes', 'Moon Monk Robes', 8000, null, 50),
  ('Water Clan Moon Monk Robes', 'Moon Monk Robes', 2000, null, 51),
  ('Armored Water Clan Moon Monk Robes', 'Moon Monk Robes', 8000, null, 52),
  ('Moon Monk Robes', 'Moon Monk Robes', 2000, null, 53),
  ('Armored Moon Monk Robes', 'Moon Monk Robes', 8000, null, 54),
  ('Linen Wraps', 'Crafting Materials', 250, 10, 55),
  ('Garnet', 'Gems', 60, null, 56),
  ('Garnet (Flawless)', 'Gems', 400, null, 57),
  ('Amethyst', 'Gems', 480, null, 58),
  ('Amethyst (Flawless)', 'Gems', 720, null, 59),
  ('Ruby', 'Gems', 100, null, 60),
  ('Ruby (Flawless)', 'Gems', 1400, null, 61),
  ('Sapphire', 'Gems', 1600, null, 62),
  ('Sapphire (Flawless)', 'Gems', 2000, null, 63),
  ('Sapphire (Exquisite)', 'Gems', 20000, null, 64),
  ('Emerald', 'Gems', 800, null, 65),
  ('Emerald (Flawless)', 'Gems', 2200, null, 66),
  ('Diamond', 'Gems', 3200, null, 67),
  ('Diamond (Flawless)', 'Gems', 4000, null, 68),
  ('Small Pearl', 'Gems', 3200, null, 69),
  ('Pearl', 'Gems', 4000, null, 70),
  ('Amulet of Akatosh', 'Amulets of the Divines', 1000, null, 71),
  ('Amulet of Arkay', 'Amulets of the Divines', 1000, null, 72),
  ('Amulet of Dibella', 'Amulets of the Divines', 1000, null, 73),
  ('Mark of Dibella', 'Amulets of the Divines', 1600, null, 74),
  ('Amulet of Julianos', 'Amulets of the Divines', 1000, null, 75),
  ('Amulet of Kynareth', 'Amulets of the Divines', 1000, null, 76),
  ('Amulet of Mara', 'Amulets of the Divines', 1000, null, 77),
  ('Amulet of Stendarr', 'Amulets of the Divines', 1000, null, 78),
  ('Amulet of Zenithar', 'Amulets of the Divines', 1000, null, 79);
