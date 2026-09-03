-- Run this once in Supabase → SQL Editor, then click "Run".

create table if not exists public.dashboard_data (
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dashboard_data enable row level security;

create policy "Users can view own dashboard"
  on public.dashboard_data for select
  using (auth.uid() = id);

create policy "Users can insert own dashboard"
  on public.dashboard_data for insert
  with check (auth.uid() = id);

create policy "Users can update own dashboard"
  on public.dashboard_data for update
  using (auth.uid() = id);
