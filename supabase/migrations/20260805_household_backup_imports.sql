create table if not exists public.household_backup_imports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  backup_id text not null check (backup_id ~ '^bk-[0-9a-f]{16}$'),
  imported_by uuid not null references auth.users(id) on delete restrict,
  imported_at timestamptz not null default timezone('utc', now()),
  row_counts jsonb not null default '{}'::jsonb,
  unique (household_id, backup_id)
);

create index if not exists household_backup_imports_household_idx
  on public.household_backup_imports(household_id, imported_at desc);

alter table public.household_backup_imports enable row level security;

create policy "members can view household backup imports"
  on public.household_backup_imports
  for select to authenticated
  using (public.is_household_member(household_id));

create policy "owners can register household backup imports"
  on public.household_backup_imports
  for insert to authenticated
  with check (public.is_household_owner(household_id) and imported_by = auth.uid());

create policy "owners can remove own household backup imports"
  on public.household_backup_imports
  for delete to authenticated
  using (public.is_household_owner(household_id) and imported_by = auth.uid());

grant select, insert, delete on table public.household_backup_imports to authenticated;
