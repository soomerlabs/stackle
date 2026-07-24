-- SCHEMA V11 — THE POINTS ECONOMY, PROOF PHASE (owner: "prove with fake
-- money people will use it"). One wallet: players.showdown_points IS the
-- points balance now.
--   · everyone starts with 100 (backfill + new-player default)
--   · showdowns become STAKED: ante rides the post (default 25); the
--     winner takes the pot (2x stake) at resolve
--   · hints spend from the same wallet (spend-points edge function)

alter table public.players
  alter column showdown_points set default 100;

update public.players
  set showdown_points = greatest(showdown_points, 100);

alter table public.open_duels
  add column if not exists stake int not null default 25
    check (stake >= 0 and stake <= 1000);
