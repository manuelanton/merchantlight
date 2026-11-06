-- Merchantlight — storage units keep what the old books knew about them: the site they stand at,
-- and whether they are rented out or company-internal (lockbox, safe) and behind a locked door.

alter table merchant.storage_units
  add column location text not null default 'Darkwater Crossing',
  add column kind     text not null default 'rental' check (kind in ('rental', 'internal')),
  add column secured  boolean not null default false;
