create extension if not exists pgcrypto;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  event_date date not null,
  event_time time,
  member text not null default '가족' check (member in ('가족', '아빠', '엄마', '도윤')),
  note text check (char_length(note) <= 300),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create index events_household_date_idx on public.events(household_id, event_date);
create index growth_entries_household_date_idx on public.growth_entries(household_id, entry_date desc);
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.events enable row level security;
alter table public.growth_entries enable row level security;

create or replace function public.is_household_member(target_household uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.household_members where household_id = target_household and user_id = auth.uid()) $$;

create policy "members can view household" on public.households for select to authenticated using (public.is_household_member(id));
create policy "members can view membership" on public.household_members for select to authenticated using (public.is_household_member(household_id));
create policy "members can view events" on public.events for select to authenticated using (public.is_household_member(household_id));
create policy "members can create events" on public.events for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "members can update events" on public.events for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members can delete events" on public.events for delete to authenticated using (public.is_household_member(household_id));
create policy "members can view growth entries" on public.growth_entries for select to authenticated using (public.is_household_member(household_id));
create policy "members can create growth entries" on public.growth_entries for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "members can update growth entries" on public.growth_entries for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members can delete growth entries" on public.growth_entries for delete to authenticated using (public.is_household_member(household_id));

create or replace function public.create_household(household_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if exists(select 1 from household_members where user_id = auth.uid()) then raise exception 'already in a household'; end if;
  insert into households(name, owner_id) values (household_name, auth.uid()) returning id into new_id;
  insert into household_members(household_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end $$;

create or replace function public.join_household(code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if exists(select 1 from household_members where user_id = auth.uid()) then raise exception 'already in a household'; end if;
  select id into target_id from households where invite_code = upper(trim(code));
  if target_id is null then raise exception 'invalid invite code'; end if;
  insert into household_members(household_id, user_id) values (target_id, auth.uid());
  return target_id;
end $$;

revoke all on function public.create_household(text) from public;
revoke all on function public.join_household(text) from public;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
