-- 가족 구성원을 직접 추가하고, 구성원별 대표 색상을 공유합니다.

alter table public.events drop constraint if exists events_member_check;
alter table public.events
  add constraint events_member_check check (char_length(member) between 1 and 20);

create table if not exists public.calendar_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, name)
);

create index if not exists calendar_members_household_sort_idx
  on public.calendar_members(household_id, sort_order);

alter table public.calendar_members enable row level security;

drop policy if exists "members can view calendar members" on public.calendar_members;
drop policy if exists "members can create calendar members" on public.calendar_members;
drop policy if exists "members can update calendar members" on public.calendar_members;
drop policy if exists "members can delete calendar members" on public.calendar_members;
create policy "members can view calendar members" on public.calendar_members
  for select to authenticated using (public.is_household_member(household_id));
create policy "members can create calendar members" on public.calendar_members
  for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "members can update calendar members" on public.calendar_members
  for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members can delete calendar members" on public.calendar_members
  for delete to authenticated using (public.is_household_member(household_id));

insert into public.calendar_members(household_id, name, color, sort_order, created_by)
select h.id, seed.name, seed.color, seed.sort_order, h.owner_id
from public.households h
cross join (values
  ('가족', '#5F8069', 0),
  ('아빠', '#B57D4B', 1),
  ('엄마', '#A56D78', 2),
  ('도윤', '#4B91A8', 3)
) as seed(name, color, sort_order)
on conflict (household_id, name) do nothing;

create or replace function public.create_household(household_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if exists(select 1 from household_members where user_id = auth.uid()) then raise exception 'already in a household'; end if;
  insert into households(name, owner_id) values (household_name, auth.uid()) returning id into new_id;
  insert into household_members(household_id, user_id, role) values (new_id, auth.uid(), 'owner');
  insert into calendar_members(household_id, name, color, sort_order, created_by) values
    (new_id, '가족', '#5F8069', 0, auth.uid()),
    (new_id, '아빠', '#B57D4B', 1, auth.uid()),
    (new_id, '엄마', '#A56D78', 2, auth.uid()),
    (new_id, '도윤', '#4B91A8', 3, auth.uid());
  return new_id;
end $$;

revoke all on function public.create_household(text) from public;
grant execute on function public.create_household(text) to authenticated;
