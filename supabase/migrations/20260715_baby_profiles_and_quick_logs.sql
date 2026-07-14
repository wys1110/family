create table if not exists public.babies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  birth_date date not null,
  birth_time time,
  sex text check (sex in ('남아', '여아')),
  birth_weight_kg numeric(4,2) check (birth_weight_kg between 0.3 and 10),
  birth_height_cm numeric(4,1) check (birth_height_cm between 20 and 80),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists babies_household_birth_idx on public.babies(household_id, birth_date);
alter table public.babies enable row level security;

drop policy if exists "members can view babies" on public.babies;
drop policy if exists "members can create babies" on public.babies;
drop policy if exists "members can update babies" on public.babies;
drop policy if exists "members can delete babies" on public.babies;
create policy "members can view babies" on public.babies for select to authenticated using (public.is_household_member(household_id));
create policy "members can create babies" on public.babies for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "members can update babies" on public.babies for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members can delete babies" on public.babies for delete to authenticated using (public.is_household_member(household_id));

alter table public.growth_entries
  add column if not exists baby_id uuid references public.babies(id) on delete cascade,
  add column if not exists feeding_type text check (feeding_type in ('모유', '젖병', '이유식')),
  add column if not exists feeding_side text check (feeding_side in ('왼쪽', '오른쪽', '양쪽')),
  add column if not exists feeding_minutes integer check (feeding_minutes > 0 and feeding_minutes <= 240);

create index if not exists growth_entries_baby_date_idx on public.growth_entries(baby_id, entry_date desc);
