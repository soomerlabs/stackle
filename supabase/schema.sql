-- SWORBL — Supabase schema v1 (standings + submissions)
-- Run in the Supabase SQL editor. Anonymous auth must be enabled:
--   Dashboard → Authentication → Providers → Anonymous sign-ins → ON.

-- ---- players: one row per auth user (anonymous to start) ----------------
create table if not exists public.players (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'PLAYER'
    check (char_length(name) between 2 and 10 and name ~ '^[A-Z0-9]+$'),
  created_at timestamptz not null default now()
);

alter table public.players enable row level security;

create policy "players read all" on public.players
  for select using (true);
create policy "players write self" on public.players
  for insert with check (auth.uid() = id);
create policy "players update self" on public.players
  for update using (auth.uid() = id);

-- ---- submissions: ONE per player per day (the daily result) -------------
create table if not exists public.submissions (
  player_id uuid not null references public.players (id) on delete cascade,
  day text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  score int not null check (score >= 0 and score < 100000),
  solved boolean not null default false,
  guesses int not null default 0 check (guesses between 0 and 6),
  words jsonb not null default '[]'::jsonb, -- [{word, pts}] for validation/par
  created_at timestamptz not null default now(),
  primary key (player_id, day)
);

create index if not exists submissions_day_score on public.submissions (day, score desc);

alter table public.submissions enable row level security;

create policy "submissions read all" on public.submissions
  for select using (true);
-- insert only (no updates: the day is one-shot, same law as the client)
create policy "submissions insert self" on public.submissions
  for insert with check (auth.uid() = player_id);

-- ---- standings views ------------------------------------------------------
create or replace view public.daily_standings as
  select s.day, s.player_id, p.name, s.score, s.solved,
         rank() over (partition by s.day order by s.score desc) as rank
  from public.submissions s
  join public.players p on p.id = s.player_id;

create or replace view public.alltime_standings as
  select s.player_id, p.name, sum(s.score)::int as total, count(*)::int as days,
         rank() over (order by sum(s.score) desc) as rank
  from public.submissions s
  join public.players p on p.id = s.player_id
  group by s.player_id, p.name;

-- v2 (noted, not built): edge-function validation re-scoring `words` with the
-- engine's letterVal/lenMult before accepting; par-bot table per day.
