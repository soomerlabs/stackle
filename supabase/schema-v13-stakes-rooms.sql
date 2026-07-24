-- SCHEMA V13 — THE ECONOMY GROWS UP (owner, 2026-07-24):
--   · named stakes ("put what you're willing to gamble in the 1v1")
--   · sealed hands ("maybe you don't reveal what you got")
--   · daily refuel ("give points everyday as a refuel thing")
--   · private rooms ("the organizer dictates the money")

-- sealed showdowns: the taker only learns the score after their own run
alter table public.open_duels
  add column if not exists sealed boolean not null default false;

-- view append is REPLACE-safe (new columns at the end). SEALED HANDS
-- (audit C4): the view is the rail's read - a sealed post serves NULL
-- score/words, so the number cannot leak before the reveal.
create or replace view public.open_duel_board as
  select d.id, d.seed, d.format,
         case when d.sealed then null else d.score end as score,
         case when d.sealed then null else d.words end as words,
         d.created_at, d.poster, p.name,
         d.stake, d.sealed
  from public.open_duels d
  join public.players p on p.id = d.poster
  where d.status = 'open';

-- table reads tighten to match (audit C4): open unsealed rows stay
-- public (ghost races); sealed/finished rows only for the two players
drop policy if exists "duels read all" on public.open_duels;
create policy "duels read gated" on public.open_duels for select
  using (
    (status = 'open' and sealed = false)
    or poster = auth.uid()
    or taker = auth.uid()
  );

-- audit H2: a poster could delete a TAKEN duel and destroy the taker's
-- ante + win - retract is for open posts only
drop policy if exists "duels delete own" on public.open_duels;
create policy "duels delete own open" on public.open_duels for delete
  using (auth.uid() = poster and status = 'open');

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

-- own rows only (audit N2: the self-referential policy recursed) -
-- clients never list a room's members directly; the edge fn does
drop policy if exists room_members_read on public.room_members;
create policy room_members_read on public.room_members for select
  using (player_id = auth.uid());
