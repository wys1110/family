create table public.growth_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  entry_date date not null,
  category text not null default '기타' check (category in ('첫 순간', '건강', '수유·이유식', '수면', '놀이', '기타')),
  height_cm numeric(5,1) check (height_cm > 0 and height_cm <= 250),
  weight_kg numeric(5,2) check (weight_kg > 0 and weight_kg <= 200),
  note text check (char_length(note) <= 1000),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index growth_entries_household_date_idx on public.growth_entries(household_id, entry_date desc);
alter table public.growth_entries enable row level security;

create policy "members can view growth entries" on public.growth_entries for select to authenticated using (public.is_household_member(household_id));
create policy "members can create growth entries" on public.growth_entries for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "members can update growth entries" on public.growth_entries for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members can delete growth entries" on public.growth_entries for delete to authenticated using (public.is_household_member(household_id));
