begin;

-- A baby reference is valid only when both IDs point to the same household.
do $$
begin
  if exists (
    select 1
    from public.growth_entries entry
    join public.babies baby on baby.id = entry.baby_id
    where entry.baby_id is not null
      and entry.household_id <> baby.household_id
  ) or exists (
    select 1
    from public.baby_ai_profiles profile
    join public.babies baby on baby.id = profile.baby_id
    where profile.household_id <> baby.household_id
  ) or exists (
    select 1
    from public.baby_ai_strategy_drafts strategy
    join public.babies baby on baby.id = strategy.baby_id
    where strategy.household_id <> baby.household_id
  ) or exists (
    select 1
    from public.baby_ai_refresh_queue queue
    join public.babies baby on baby.id = queue.baby_id
    where queue.household_id <> baby.household_id
  ) then
    raise exception 'mismatched baby household: repair cross-household links before applying data-integrity-hardening';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.babies'::regclass and conname = 'babies_id_household_key'
  ) then
    alter table public.babies add constraint babies_id_household_key unique (id, household_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.growth_entries'::regclass and conname = 'growth_entries_baby_household_fkey'
  ) then
    alter table public.growth_entries add constraint growth_entries_baby_household_fkey
      foreign key (baby_id, household_id) references public.babies(id, household_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.baby_ai_profiles'::regclass and conname = 'baby_ai_profiles_baby_household_fkey'
  ) then
    alter table public.baby_ai_profiles add constraint baby_ai_profiles_baby_household_fkey
      foreign key (baby_id, household_id) references public.babies(id, household_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.baby_ai_strategy_drafts'::regclass and conname = 'baby_ai_strategy_drafts_baby_household_fkey'
  ) then
    alter table public.baby_ai_strategy_drafts add constraint baby_ai_strategy_drafts_baby_household_fkey
      foreign key (baby_id, household_id) references public.babies(id, household_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.baby_ai_refresh_queue'::regclass and conname = 'baby_ai_refresh_queue_baby_household_fkey'
  ) then
    alter table public.baby_ai_refresh_queue add constraint baby_ai_refresh_queue_baby_household_fkey
      foreign key (baby_id, household_id) references public.babies(id, household_id) on delete cascade;
  end if;
end $$;

drop policy if exists "members can create calendar members" on public.calendar_members;
drop policy if exists "members can update calendar members" on public.calendar_members;
drop policy if exists "members can delete calendar members" on public.calendar_members;
create policy "members can create calendar members" on public.calendar_members
  for insert to authenticated
  with check (public.is_household_owner(household_id) and created_by = auth.uid());
create policy "members can update calendar members" on public.calendar_members
  for update to authenticated
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));
create policy "members can delete calendar members" on public.calendar_members
  for delete to authenticated
  using (public.is_household_owner(household_id));

drop policy if exists "members can register household backup imports" on public.household_backup_imports;
drop policy if exists "owners can register household backup imports" on public.household_backup_imports;
drop policy if exists "owners can remove own household backup imports" on public.household_backup_imports;
create policy "owners can register household backup imports" on public.household_backup_imports
  for insert to authenticated
  with check (public.is_household_owner(household_id) and imported_by = auth.uid());
create policy "owners can remove own household backup imports" on public.household_backup_imports
  for delete to authenticated
  using (public.is_household_owner(household_id) and imported_by = auth.uid());
grant delete on table public.household_backup_imports to authenticated;

-- A restore either writes every validated row or writes nothing.  The client
-- cannot choose the target household, author, or persisted primary keys.
create or replace function public.restore_household_backup(
  target_household_id uuid,
  p_backup_id text,
  p_tables jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  backup_import_id uuid;
  backup_row jsonb;
  source_baby_id text;
  restored_baby_id uuid;
  baby_id_map jsonb := '{}'::jsonb;
  babies_count integer := 0;
  events_count integer := 0;
  members_count integer := 0;
  growth_count integer := 0;
  rows_written integer := 0;
  table_name text;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;
  if not public.is_household_owner(target_household_id) then
    raise exception 'household owner required';
  end if;
  if p_backup_id !~ '^bk-[0-9a-f]{16}$' then
    raise exception 'invalid backup id';
  end if;
  if jsonb_typeof(p_tables) <> 'object' then
    raise exception 'invalid backup tables';
  end if;
  foreach table_name in array array['babies', 'events', 'calendar_members', 'growth_entries'] loop
    if jsonb_typeof(p_tables -> table_name) is distinct from 'array' then
      raise exception 'invalid backup table: %', table_name;
    end if;
  end loop;

  insert into public.household_backup_imports (household_id, backup_id, imported_by)
  values (target_household_id, p_backup_id, actor_id)
  on conflict (household_id, backup_id) do nothing
  returning id into backup_import_id;
  if backup_import_id is null then
    return jsonb_build_object('duplicate', true);
  end if;

  for backup_row in select value from jsonb_array_elements(p_tables -> 'babies') loop
    source_baby_id := nullif(backup_row ->> 'id', '');
    if source_baby_id is null or baby_id_map ? source_baby_id then
      raise exception 'invalid backup baby id';
    end if;
    if nullif(backup_row ->> 'name', '') is null or nullif(backup_row ->> 'birth_date', '') is null then
      raise exception 'backup baby is missing a required field';
    end if;
    insert into public.babies (
      household_id, name, birth_date, birth_time, sex, birth_weight_kg, birth_height_cm, archived_at, created_by
    ) values (
      target_household_id,
      backup_row ->> 'name',
      (backup_row ->> 'birth_date')::date,
      nullif(backup_row ->> 'birth_time', '')::time,
      nullif(backup_row ->> 'sex', ''),
      nullif(backup_row ->> 'birth_weight_kg', '')::numeric,
      nullif(backup_row ->> 'birth_height_cm', '')::numeric,
      nullif(backup_row ->> 'archived_at', '')::timestamptz,
      actor_id
    ) returning id into restored_baby_id;
    baby_id_map := baby_id_map || jsonb_build_object(source_baby_id, restored_baby_id::text);
    babies_count := babies_count + 1;
  end loop;

  for backup_row in select value from jsonb_array_elements(p_tables -> 'events') loop
    if nullif(backup_row ->> 'title', '') is null or nullif(backup_row ->> 'event_date', '') is null then
      raise exception 'backup event is missing a required field';
    end if;
    insert into public.events (
      household_id, title, event_date, event_end_date, event_time, member, note, created_by
    ) values (
      target_household_id,
      backup_row ->> 'title',
      (backup_row ->> 'event_date')::date,
      coalesce(nullif(backup_row ->> 'event_end_date', ''), backup_row ->> 'event_date')::date,
      nullif(backup_row ->> 'event_time', '')::time,
      coalesce(nullif(backup_row ->> 'member', ''), '가족'),
      nullif(backup_row ->> 'note', ''),
      actor_id
    );
    events_count := events_count + 1;
  end loop;

  for backup_row in select value from jsonb_array_elements(p_tables -> 'calendar_members') loop
    if nullif(backup_row ->> 'name', '') is null or nullif(backup_row ->> 'color', '') is null then
      raise exception 'backup calendar member is missing a required field';
    end if;
    insert into public.calendar_members (
      household_id, name, color, sort_order, archived_at, created_by
    ) values (
      target_household_id,
      backup_row ->> 'name',
      backup_row ->> 'color',
      coalesce(nullif(backup_row ->> 'sort_order', '')::integer, 0),
      nullif(backup_row ->> 'archived_at', '')::timestamptz,
      actor_id
    ) on conflict (household_id, name) do nothing;
    get diagnostics rows_written = row_count;
    members_count := members_count + rows_written;
  end loop;

  for backup_row in select value from jsonb_array_elements(p_tables -> 'growth_entries') loop
    source_baby_id := nullif(backup_row ->> 'baby_id', '');
    restored_baby_id := null;
    if source_baby_id is not null then
      restored_baby_id := nullif(baby_id_map ->> source_baby_id, '')::uuid;
      if restored_baby_id is null then
        raise exception 'growth entry references an unknown backup baby';
      end if;
    end if;
    if nullif(backup_row ->> 'title', '') is null or nullif(backup_row ->> 'entry_date', '') is null then
      raise exception 'backup growth entry is missing a required field';
    end if;
    insert into public.growth_entries (
      household_id, baby_id, title, entry_date, entry_time, category,
      height_cm, weight_kg, head_cm, feeding_ml, feeding_type, feeding_side,
      feeding_minutes, sleep_minutes, temperature_c, diaper_kind, note, created_by
    ) values (
      target_household_id,
      restored_baby_id,
      backup_row ->> 'title',
      (backup_row ->> 'entry_date')::date,
      nullif(backup_row ->> 'entry_time', '')::time,
      coalesce(nullif(backup_row ->> 'category', ''), '기타'),
      nullif(backup_row ->> 'height_cm', '')::numeric,
      nullif(backup_row ->> 'weight_kg', '')::numeric,
      nullif(backup_row ->> 'head_cm', '')::numeric,
      nullif(backup_row ->> 'feeding_ml', '')::integer,
      nullif(backup_row ->> 'feeding_type', ''),
      nullif(backup_row ->> 'feeding_side', ''),
      nullif(backup_row ->> 'feeding_minutes', '')::integer,
      nullif(backup_row ->> 'sleep_minutes', '')::integer,
      nullif(backup_row ->> 'temperature_c', '')::numeric,
      nullif(backup_row ->> 'diaper_kind', ''),
      nullif(backup_row ->> 'note', ''),
      actor_id
    );
    growth_count := growth_count + 1;
  end loop;

  update public.household_backup_imports
  set row_counts = jsonb_build_object(
    'babies', babies_count,
    'events', events_count,
    'calendar_members', members_count,
    'growth_entries', growth_count
  )
  where id = backup_import_id;

  return jsonb_build_object(
    'duplicate', false,
    'row_counts', jsonb_build_object(
      'babies', babies_count,
      'events', events_count,
      'calendar_members', members_count,
      'growth_entries', growth_count
    )
  );
end;
$$;

revoke all on function public.restore_household_backup(uuid, text, jsonb) from public, anon;
grant execute on function public.restore_household_backup(uuid, text, jsonb) to authenticated;

commit;
