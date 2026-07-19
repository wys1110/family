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

create table public.babies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  birth_date date not null,
  birth_time time,
  sex text check (sex in ('남아', '여아')),
  birth_weight_kg numeric(4,2) check (birth_weight_kg between 0.3 and 10),
  birth_height_cm numeric(4,1) check (birth_height_cm between 20 and 80),
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_members (
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

create table public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  event_date date not null,
  event_end_date date not null check (event_end_date >= event_date),
  event_time time,
  member text not null default '가족' check (char_length(member) between 1 and 20),
  note text check (char_length(note) <= 300),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.growth_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  baby_id uuid references public.babies(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  entry_date date not null,
  entry_time time,
  category text not null default '기타' check (category in ('첫 순간', '성장', '수유·이유식', '수면', '기저귀', '건강·병원', '놀이', '기타')),
  height_cm numeric(5,1) check (height_cm > 0 and height_cm <= 250),
  weight_kg numeric(5,2) check (weight_kg > 0 and weight_kg <= 200),
  head_cm numeric(4,1) check (head_cm > 0 and head_cm <= 100),
  feeding_ml integer check (feeding_ml > 0 and feeding_ml <= 3000),
  feeding_type text check (feeding_type in ('모유', '젖병', '이유식')),
  feeding_side text check (feeding_side in ('왼쪽', '오른쪽', '양쪽')),
  feeding_minutes integer check (feeding_minutes > 0 and feeding_minutes <= 240),
  sleep_minutes integer check (sleep_minutes > 0 and sleep_minutes <= 1440),
  temperature_c numeric(3,1) check (temperature_c between 30 and 45),
  diaper_kind text check (diaper_kind in ('소변', '대변', '소변·대변')),
  note text check (char_length(note) <= 1000),
  photo_paths text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'done', 'dismissed')),
  requester_name text check (requester_name is null or char_length(requester_name) <= 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_todos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  due_date date,
  assignee text not null default '가족' check (char_length(assignee) between 1 and 20),
  note text check (note is null or char_length(note) <= 500),
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  completed boolean not null default false,
  completed_at timestamptz,
  recurrence_parent_id uuid references public.family_todos(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((completed = false and completed_at is null) or completed = true)
);

create index events_household_date_idx on public.events(household_id, event_date);
create index babies_household_birth_idx on public.babies(household_id, birth_date);
create index babies_active_household_birth_idx on public.babies(household_id, birth_date) where archived_at is null;
create index calendar_members_household_sort_idx on public.calendar_members(household_id, sort_order);
create index growth_entries_household_date_idx on public.growth_entries(household_id, entry_date desc);
create index feature_requests_household_created_idx on public.feature_requests(household_id, created_at desc);
create index family_todos_household_due_idx on public.family_todos(household_id, completed, due_date, created_at desc);
create unique index family_todos_recurrence_parent_unique_idx on public.family_todos(recurrence_parent_id) where recurrence_parent_id is not null;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.events enable row level security;
alter table public.babies enable row level security;
alter table public.calendar_members enable row level security;
alter table public.growth_entries enable row level security;
alter table public.feature_requests enable row level security;
alter table public.family_todos enable row level security;

create or replace function public.is_household_member(target_household uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.household_members where household_id = target_household and user_id = auth.uid()) $$;

create or replace function public.is_household_owner(target_household uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.households where id = target_household and owner_id = auth.uid()) $$;

create policy "members can view household" on public.households for select to authenticated using (public.is_household_member(id));
create policy "members can view membership" on public.household_members for select to authenticated using (public.is_household_member(household_id));
create policy "members can view events" on public.events for select to authenticated using (public.is_household_member(household_id));
create policy "members can create events" on public.events for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "members can update events" on public.events for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members can delete events" on public.events for delete to authenticated using (public.is_household_member(household_id));
create policy "members can view babies" on public.babies for select to authenticated using (public.is_household_member(household_id));
create policy "members can create babies" on public.babies for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "members can update babies" on public.babies for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members can delete babies" on public.babies for delete to authenticated using (public.is_household_member(household_id));
create policy "members can view calendar members" on public.calendar_members for select to authenticated using (public.is_household_member(household_id));
create policy "members can create calendar members" on public.calendar_members for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "members can update calendar members" on public.calendar_members for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members can delete calendar members" on public.calendar_members for delete to authenticated using (public.is_household_member(household_id));
create policy "members can view growth entries" on public.growth_entries for select to authenticated using (public.is_household_member(household_id));
create policy "members can create growth entries" on public.growth_entries for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "members can update growth entries" on public.growth_entries for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members can delete growth entries" on public.growth_entries for delete to authenticated using (public.is_household_member(household_id));
create policy "members can submit feature requests" on public.feature_requests for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid() and status = 'new');
create policy "owner can view feature requests" on public.feature_requests for select to authenticated using (public.is_household_owner(household_id));
create policy "owner can update feature requests" on public.feature_requests for update to authenticated using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));
create policy "members can view family todos" on public.family_todos for select to authenticated using (public.is_household_member(household_id));
create policy "members can create family todos" on public.family_todos for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "members can update family todos" on public.family_todos for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members can delete family todos" on public.family_todos for delete to authenticated using (public.is_household_member(household_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('growth-photos', 'growth-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "family can view growth photos" on storage.objects for select to authenticated
using (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy "family can upload growth photos" on storage.objects for insert to authenticated
with check (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy "family can update growth photos" on storage.objects for update to authenticated
using (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid))
with check (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy "family can delete growth photos" on storage.objects for delete to authenticated
using (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));

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
revoke all on function public.is_household_owner(uuid) from public;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;

-- AI 육아 도우미: 가족 공동 프로필, 전략 초안, 자동 갱신 큐
create table public.baby_ai_profiles (
  baby_id uuid primary key references public.babies(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  feeding_method text check (feeding_method is null or char_length(feeding_method) <= 2000),
  feeding_traits text check (feeding_traits is null or char_length(feeding_traits) <= 2000),
  sleep_onset_method text check (sleep_onset_method is null or char_length(sleep_onset_method) <= 2000),
  sleep_environment text check (sleep_environment is null or char_length(sleep_environment) <= 2000),
  temperament text check (temperament is null or char_length(temperament) <= 2000),
  soothing_methods text check (soothing_methods is null or char_length(soothing_methods) <= 2000),
  baby_notes text check (baby_notes is null or char_length(baby_notes) <= 2000),
  mother_schedule jsonb not null default '{}'::jsonb check (jsonb_typeof(mother_schedule) = 'object'),
  father_schedule jsonb not null default '{}'::jsonb check (jsonb_typeof(father_schedule) = 'object'),
  family_notes text check (family_notes is null or char_length(family_notes) <= 2000),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (baby_id, household_id)
);

create table public.baby_ai_strategy_drafts (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('feeding', 'sleep')),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'superseded')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  source_window_start timestamptz not null,
  source_window_end timestamptz not null check (source_window_end >= source_window_start),
  source_log_count integer not null default 0 check (source_log_count >= 0),
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  check ((status = 'confirmed' and confirmed_by is not null and confirmed_at is not null) or status <> 'confirmed')
);

create table public.baby_ai_refresh_queue (
  baby_id uuid primary key references public.babies(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  generation bigint not null default 1 check (generation > 0),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  updated_at timestamptz not null default now()
);

create index baby_ai_strategy_drafts_baby_kind_generated_idx on public.baby_ai_strategy_drafts(baby_id, kind, generated_at desc);
create unique index baby_ai_strategy_one_confirmed_idx on public.baby_ai_strategy_drafts(baby_id, kind) where status = 'confirmed';
create index baby_ai_refresh_queue_due_idx on public.baby_ai_refresh_queue(status, due_at) where status in ('pending', 'failed');

alter table public.baby_ai_profiles enable row level security;
alter table public.baby_ai_strategy_drafts enable row level security;
alter table public.baby_ai_refresh_queue enable row level security;

create policy "members can view baby AI profiles" on public.baby_ai_profiles for select to authenticated using (public.is_household_member(household_id));
create policy "members can create baby AI profiles" on public.baby_ai_profiles for insert to authenticated with check (public.is_household_member(household_id) and updated_by = auth.uid());
create policy "members can update baby AI profiles" on public.baby_ai_profiles for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id) and updated_by = auth.uid());
create policy "members can delete baby AI profiles" on public.baby_ai_profiles for delete to authenticated using (public.is_household_member(household_id));
create policy "members can view baby AI strategies" on public.baby_ai_strategy_drafts for select to authenticated using (public.is_household_member(household_id));
create policy "members can view baby AI refresh state" on public.baby_ai_refresh_queue for select to authenticated using (public.is_household_member(household_id));

create or replace function public.schedule_baby_ai_refresh(target_baby_id uuid)
returns timestamptz language plpgsql security definer set search_path = public
as $$
declare target_household_id uuid; scheduled_at timestamptz := now() + interval '30 minutes';
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select household_id into target_household_id from public.babies where id = target_baby_id and archived_at is null;
  if target_household_id is null then raise exception 'baby not found'; end if;
  if not public.is_household_member(target_household_id) then raise exception 'forbidden'; end if;
  insert into public.baby_ai_refresh_queue (baby_id, household_id, due_at, status, attempt_count, generation, last_error, updated_at)
  values (target_baby_id, target_household_id, scheduled_at, 'pending', 0, 1, null, now())
  on conflict (baby_id) do update set household_id = excluded.household_id, due_at = excluded.due_at,
    status = 'pending', attempt_count = 0, generation = public.baby_ai_refresh_queue.generation + 1,
    last_error = null, updated_at = now();
  return scheduled_at;
end $$;

create or replace function public.confirm_baby_ai_strategy(target_strategy_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target_row public.baby_ai_strategy_drafts%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into target_row from public.baby_ai_strategy_drafts where id = target_strategy_id for update;
  if target_row.id is null then raise exception 'strategy not found'; end if;
  if not public.is_household_member(target_row.household_id) then raise exception 'forbidden'; end if;
  update public.baby_ai_strategy_drafts set status = 'superseded'
    where baby_id = target_row.baby_id and kind = target_row.kind and status = 'confirmed' and id <> target_row.id;
  update public.baby_ai_strategy_drafts set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
    where id = target_row.id and status in ('draft', 'confirmed');
  if not found then raise exception 'strategy cannot be confirmed'; end if;
  return target_row.id;
end $$;

revoke all on function public.schedule_baby_ai_refresh(uuid) from public;
revoke all on function public.confirm_baby_ai_strategy(uuid) from public;
grant execute on function public.schedule_baby_ai_refresh(uuid) to authenticated;
grant execute on function public.confirm_baby_ai_strategy(uuid) to authenticated;
