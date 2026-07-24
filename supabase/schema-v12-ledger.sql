-- SCHEMA V12 — THE LEDGER (owner: "how do i manage my currency?").
-- Every point mutation records an event; players read their own history.
create table if not exists public.point_events (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  delta int not null,
  reason text not null check (char_length(reason) <= 32),
  created_at timestamptz not null default now()
);

create index if not exists point_events_player on public.point_events (player_id, id desc);

alter table public.point_events enable row level security;

drop policy if exists "ledger read own" on public.point_events;
create policy "ledger read own" on public.point_events
  for select using (auth.uid() = player_id);
-- writes: service role only (the functions record as they mutate)
