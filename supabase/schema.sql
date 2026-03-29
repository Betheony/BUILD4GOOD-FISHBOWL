-- Run this SQL in Supabase SQL editor.
-- This creates per-user whiteboard storage with strict row-level security.

create extension if not exists pgcrypto;

create table if not exists public.whiteboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Whiteboard',
  state_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whiteboards_user_updated
  on public.whiteboards(user_id, updated_at desc);

create or replace function public.set_whiteboards_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_whiteboards_updated_at on public.whiteboards;
create trigger trg_whiteboards_updated_at
before update on public.whiteboards
for each row
execute function public.set_whiteboards_updated_at();

alter table public.whiteboards enable row level security;

drop policy if exists "whiteboards_select_own" on public.whiteboards;
create policy "whiteboards_select_own"
on public.whiteboards
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "whiteboards_insert_own" on public.whiteboards;
create policy "whiteboards_insert_own"
on public.whiteboards
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "whiteboards_update_own" on public.whiteboards;
create policy "whiteboards_update_own"
on public.whiteboards
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "whiteboards_delete_own" on public.whiteboards;
create policy "whiteboards_delete_own"
on public.whiteboards
for delete
to authenticated
using (auth.uid() = user_id);
