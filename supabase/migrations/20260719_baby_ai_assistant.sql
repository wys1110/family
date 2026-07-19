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

create index baby_ai_strategy_drafts_baby_kind_generated_idx
  on public.baby_ai_strategy_drafts(baby_id, kind, generated_at desc);
create unique index baby_ai_strategy_one_confirmed_idx
  on public.baby_ai_strategy_drafts(baby_id, kind) where status = 'confirmed';
create index baby_ai_refresh_queue_due_idx
  on public.baby_ai_refresh_queue(status, due_at) where status in ('pending', 'failed');

alter table public.baby_ai_profiles enable row level security;
alter table public.baby_ai_strategy_drafts enable row level security;
alter table public.baby_ai_refresh_queue enable row level security;

create policy "members can view baby AI profiles" on public.baby_ai_profiles
  for select to authenticated using (public.is_household_member(household_id));
create policy "members can create baby AI profiles" on public.baby_ai_profiles
  for insert to authenticated with check (public.is_household_member(household_id) and updated_by = auth.uid());
create policy "members can update baby AI profiles" on public.baby_ai_profiles
  for update to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id) and updated_by = auth.uid());
create policy "members can delete baby AI profiles" on public.baby_ai_profiles
  for delete to authenticated using (public.is_household_member(household_id));

create policy "members can view baby AI strategies" on public.baby_ai_strategy_drafts
  for select to authenticated using (public.is_household_member(household_id));
create policy "members can view baby AI refresh state" on public.baby_ai_refresh_queue
  for select to authenticated using (public.is_household_member(household_id));

create or replace function public.schedule_baby_ai_refresh(target_baby_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household_id uuid;
  scheduled_at timestamptz := now() + interval '30 minutes';
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select household_id into target_household_id
  from public.babies
  where id = target_baby_id and archived_at is null;

  if target_household_id is null then raise exception 'baby not found'; end if;
  if not public.is_household_member(target_household_id) then raise exception 'forbidden'; end if;

  insert into public.baby_ai_refresh_queue (
    baby_id, household_id, due_at, status, attempt_count, generation, last_error, updated_at
  ) values (
    target_baby_id, target_household_id, scheduled_at, 'pending', 0, 1, null, now()
  )
  on conflict (baby_id) do update set
    household_id = excluded.household_id,
    due_at = excluded.due_at,
    status = 'pending',
    attempt_count = 0,
    generation = public.baby_ai_refresh_queue.generation + 1,
    last_error = null,
    updated_at = now();

  return scheduled_at;
end $$;

create or replace function public.confirm_baby_ai_strategy(target_strategy_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_row public.baby_ai_strategy_drafts%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into target_row
  from public.baby_ai_strategy_drafts
  where id = target_strategy_id
  for update;

  if target_row.id is null then raise exception 'strategy not found'; end if;
  if not public.is_household_member(target_row.household_id) then raise exception 'forbidden'; end if;

  update public.baby_ai_strategy_drafts
  set status = 'superseded'
  where baby_id = target_row.baby_id
    and kind = target_row.kind
    and status in ('draft', 'confirmed')
    and id <> target_row.id;

  update public.baby_ai_strategy_drafts
  set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
  where id = target_row.id and status in ('draft', 'confirmed');

  if not found then raise exception 'strategy cannot be confirmed'; end if;
  return target_row.id;
end $$;

revoke all on function public.schedule_baby_ai_refresh(uuid) from public;
revoke all on function public.confirm_baby_ai_strategy(uuid) from public;
grant execute on function public.schedule_baby_ai_refresh(uuid) to authenticated;
grant execute on function public.confirm_baby_ai_strategy(uuid) to authenticated;
