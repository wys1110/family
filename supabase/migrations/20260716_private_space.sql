-- 개인 전용 공간: 로그인한 본인만 읽고 쓸 수 있는 기록 테이블
create extension if not exists pgcrypto;

create table if not exists public.private_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null default current_date,
  entry_type text not null default '일기',
  title text not null check (char_length(title) between 1 and 80),
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists private_entries_owner_date_idx
  on public.private_entries (owner_id, entry_date desc, created_at desc);

alter table public.private_entries enable row level security;

revoke all on table public.private_entries from anon;
grant select, insert, update, delete on table public.private_entries to authenticated;

drop policy if exists "private entries select own" on public.private_entries;
create policy "private entries select own"
  on public.private_entries for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "private entries insert own" on public.private_entries;
create policy "private entries insert own"
  on public.private_entries for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "private entries update own" on public.private_entries;
create policy "private entries update own"
  on public.private_entries for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "private entries delete own" on public.private_entries;
create policy "private entries delete own"
  on public.private_entries for delete
  to authenticated
  using (auth.uid() = owner_id);
