-- SCHEMA V14 — CALL-OUTS & ROOM INVITES (owner: "can i select a specific
-- user? and for private too, add in users"). A direct invite is an OFFER:
-- the named player consents (and antes/pays) at accept — never auto-seated.

-- showdowns aimed at ONE player
alter table public.open_duels
  add column if not exists challenged uuid references public.players(id);

-- view append is REPLACE-safe (new columns at the end)
create or replace view public.open_duel_board as
  select d.id, d.seed, d.format,
         case when d.sealed then null else d.score end as score,
         case when d.sealed then null else d.words end as words,
         d.created_at, d.poster, p.name,
         d.stake, d.sealed,
         d.challenged,
         (select p2.name from public.players p2 where p2.id = d.challenged) as challenged_name
  from public.open_duels d
  join public.players p on p.id = d.poster
  where d.status = 'open';

-- room invites: a pending offer the invitee accepts (and pays) themselves
create table if not exists public.room_invites (
  room_id    bigint not null references public.rooms(id) on delete cascade,
  inviter    uuid   not null references public.players(id),
  invitee    uuid   not null references public.players(id),
  created_at timestamptz not null default now(),
  primary key (room_id, invitee)
);

alter table public.room_invites enable row level security;

drop policy if exists room_invites_read_own on public.room_invites;
create policy room_invites_read_own on public.room_invites for select
  using (invitee = auth.uid() or inviter = auth.uid());

-- the invitee's inbox: open rooms only, with everything the card needs
create or replace view public.my_room_invites as
  select i.room_id, r.code, r.name, r.entry, r.pot,
         (select p.name from public.players p where p.id = i.inviter) as inviter_name
  from public.room_invites i
  join public.rooms r on r.id = i.room_id
  where i.invitee = auth.uid() and r.status = 'open';

-- ANALYTICS (owner: "so we can tell how things are going") - one insert-
-- only event stream. Clients write their own rows; nobody reads via the
-- API (the dashboard's SQL editor is the analyst).
create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  player_id  uuid references public.players(id),
  name       text not null check (char_length(name) <= 48),
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_events enable row level security;

drop policy if exists app_events_insert_own on public.app_events;
create policy app_events_insert_own on public.app_events for insert
  with check (player_id = auth.uid());

create index if not exists app_events_name_day on public.app_events (name, created_at);
