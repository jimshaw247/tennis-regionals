-- Run this once in the Supabase SQL editor after creating the project.
-- Single-row store for the live tournament state; readable by anyone, writable
-- only via the service-role key (used by the /api/state serverless function).

create table if not exists public.tennis_state (
  id          int primary key default 1,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  check (id = 1)
);

alter table public.tennis_state enable row level security;

-- Anyone can read (powers the /view page and the admin's initial pull).
drop policy if exists "Anyone can read tennis_state" on public.tennis_state;
create policy "Anyone can read tennis_state"
  on public.tennis_state for select
  to anon, authenticated
  using (true);

-- No insert/update policy for anon: service-role key bypasses RLS, so writes
-- only flow through the /api/state endpoint with the admin password check.

-- Enable realtime on this table so /view gets push updates within ~1s.
alter publication supabase_realtime add table public.tennis_state;
