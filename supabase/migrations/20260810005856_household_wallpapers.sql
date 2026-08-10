create table public.household_wallpapers (
  household_id uuid not null references public.households(id) on delete cascade,
  surface text not null check (surface in ('calendar', 'growth')),
  photo_path text not null check (photo_path like household_id::text || '/wallpapers/' || surface || '/%'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, surface)
);

alter table public.household_wallpapers enable row level security;

create policy "members can view household wallpapers" on public.household_wallpapers
  for select to authenticated using ((select public.is_household_member(household_id)));
create policy "owners can create household wallpapers" on public.household_wallpapers
  for insert to authenticated with check ((select public.is_household_owner(household_id)) and created_by = (select auth.uid()));
create policy "owners can update household wallpapers" on public.household_wallpapers
  for update to authenticated using ((select public.is_household_owner(household_id))) with check ((select public.is_household_owner(household_id)) and created_by = (select auth.uid()));
create policy "owners can delete household wallpapers" on public.household_wallpapers
  for delete to authenticated using ((select public.is_household_owner(household_id)));
