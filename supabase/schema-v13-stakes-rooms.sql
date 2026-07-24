-- SCHEMA V13 — THE ECONOMY GROWS UP (owner, 2026-07-24):
--   · named stakes ("put what you're willing to gamble in the 1v1")
--   · sealed hands ("maybe you don't reveal what you got")
--   · daily refuel ("give points everyday as a refuel thing")
--   · private rooms ("the organizer dictates the money")

-- sealed showdowns: the taker only learns the score after their own run
alter table public.open_duels
  add column if not exists sealed boolean not null default false;

-- view append is REPLACE-safe (new columns at the end)
create or replace view public.open_duel_board as
  select d.id, d.seed, d.format, d.score, d.words, d.created_at, d.poster, p.name,
         d.stake, d.sealed
  from public.open_duels d
  join public.players p on p.id = d.poster
  where d.status = 'open';

-- daily refuel: one grant per UTC day, tracked on the player
alter table public.players
  add column if not exists last_refuel date;

-- PURCHASE RECEIPTS (owner bug: "drained my account, no hint") — every
-- spend carries a client ref; a retry with the same ref is a no-op, so a
-- lost response can never double-charge.
alter table public.point_events
  add column if not exists ref text unique;

-- one-off compensation for the phantom-hint charges: refill to the floor
update public.players
  set showdown_points = greatest(showdown_points, 100);

-- PRIVATE ROOMS: an organizer names the buy-in; entries feed the pot;
-- the board is the practice lane on the room's own seed.
create table if not exists public.rooms (
  id         bigint generated always as identity primary key,
  code       text not null unique,            -- 6-char join code
  name       text not null,
  host       uuid not null references public.players(id),
  seed       text not null,                   -- r-<code>, deterministic board
  entry      int  not null default 0 check (entry >= 0 and entry <= 500),
  pot        int  not null default 0,
  status     text not null default 'open' check (status in ('open', 'settled')),
  winner     uuid references public.players(id),
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id    bigint not null references public.rooms(id) on delete cascade,
  player_id  uuid   not null references public.players(id),
  joined_at  timestamptz not null default now(),
  primary key (room_id, player_id)
);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;

-- members can read their rooms; joining goes through the edge function
drop policy if exists rooms_member_read on public.rooms;
create policy rooms_member_read on public.rooms for select
  using (exists (select 1 from public.room_members m
                 where m.room_id = id and m.player_id = auth.uid()));

drop policy if exists room_members_read on public.room_members;
create policy room_members_read on public.room_members for select
  using (exists (select 1 from public.room_members m2
                 where m2.room_id = room_id and m2.player_id = auth.uid()));
