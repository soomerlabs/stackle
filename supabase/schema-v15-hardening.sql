-- SCHEMA V15 — THE AUDIT HARDENING (2026-07-26 full audit, C1/H3/M2/M9).
-- Shrinks the accepted proof-phase surface to EXACTLY what was intended.

-- C1: the players self-update policy exposed every column. Intended
-- surface: name (rename flow) + showdown_points (accepted tradeoff +
-- the dev wallet tool). last_refuel becomes server-only — nulling it
-- re-armed the refuel for unlimited +100s.
revoke update on public.players from anon, authenticated;
grant update (name, showdown_points) on public.players to authenticated;

-- the wallet obeys arithmetic now (every other economic column had one)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'players_points_sane'
  ) then
    alter table public.players
      add constraint players_points_sane
      check (showdown_points >= 0 and showdown_points <= 1000000);
  end if;
end $$;

-- H3: receipts are per-PLAYER — a global unique ref let one player's
-- receipt swallow another's charge (low-entropy client refs collide)
alter table public.point_events
  drop constraint if exists point_events_ref_key;
create unique index if not exists point_events_player_ref
  on public.point_events (player_id, ref) where ref is not null;

-- M9: the FK/policy columns RLS filters on, indexed
create index if not exists open_duels_taker_idx on public.open_duels (taker);
create index if not exists open_duels_challenged_idx on public.open_duels (challenged);
create index if not exists room_members_player_idx on public.room_members (player_id);
create index if not exists room_invites_invitee_idx on public.room_invites (invitee);
