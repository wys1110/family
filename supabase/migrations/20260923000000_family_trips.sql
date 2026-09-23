create table if not exists public.family_trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  destination_label text not null check (char_length(destination_label) between 1 and 120),
  center_lat double precision,
  center_lng double precision,
  timezone text not null default 'Asia/Seoul' check (char_length(timezone) between 1 and 80),
  start_date date not null,
  end_date date not null check (end_date >= start_date and end_date < start_date + 366),
  document jsonb not null default '{"schemaVersion":2,"items":[],"legacy":{}}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  last_mutation_id text,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((center_lat is null and center_lng is null) or (center_lat between -90 and 90 and center_lng between -180 and 180))
);

create index if not exists family_trips_household_dates_idx on public.family_trips(household_id, start_date, archived_at);
create index if not exists family_trips_household_updated_idx on public.family_trips(household_id, updated_at desc);

alter table public.family_trips enable row level security;

drop policy if exists "members can view family trips" on public.family_trips;
drop policy if exists "members can create family trips" on public.family_trips;
drop policy if exists "members can update family trips" on public.family_trips;
drop policy if exists "members can archive family trips" on public.family_trips;

create policy "members can view family trips" on public.family_trips
  for select to authenticated using (public.is_household_member(household_id));
create policy "members can create family trips" on public.family_trips
  for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid() and updated_by = auth.uid());
create policy "members can update family trips" on public.family_trips
  for update to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id) and updated_by = auth.uid() and household_id = (select hm.household_id from public.household_members hm where hm.household_id = family_trips.household_id and hm.user_id = auth.uid() limit 1));

grant select, insert, update on public.family_trips to authenticated;

create or replace function public.touch_family_trips_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists family_trips_touch_updated_at on public.family_trips;
create trigger family_trips_touch_updated_at before update on public.family_trips
for each row execute function public.touch_family_trips_updated_at();

create or replace function public.prevent_family_trip_scope_change()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if new.household_id <> old.household_id or new.created_by <> old.created_by then
    raise exception 'family trip ownership cannot change';
  end if;
  return new;
end $$;

drop trigger if exists family_trips_scope_guard on public.family_trips;
create trigger family_trips_scope_guard before update on public.family_trips
for each row execute function public.prevent_family_trip_scope_change();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.family_trips;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
