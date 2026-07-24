-- SCHEMA V7 — SAFETY (App Store 1.2 / 5.1.1): player reports + account
-- deletion support. Deletion itself needs no schema: every player table
-- cascades from public.players, which cascades from auth.users — the
-- delete-account edge function removes the auth user and the rest follows.

-- player reports: insert-only for signed-in users, reviewed in the
-- dashboard. No select/update/delete policies — reports are write-only
-- from the client's side.
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null references public.players (id) on delete cascade,
  reported_name text not null check (char_length(reported_name) between 1 and 24),
  context text not null default '' check (char_length(context) <= 64),
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own" on public.reports
  for insert with check (auth.uid() = reporter);

-- one player can't flood reports: at most 20 a day (cheap guard; the
-- edge rate limits cover the rest)
create index if not exists reports_reporter_day on public.reports (reporter, created_at);
