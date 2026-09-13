begin;
-- Keep restored head circumference distinct from height.
create or replace function public.restore_household_backup_v3(
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
  photo_path text;
  todo_id_map jsonb := '{}'::jsonb;
  restored_todo_id uuid;
  todos_count integer := 0;
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

  if p_tables ? 'family_todos' and jsonb_typeof(p_tables->'family_todos') is distinct from 'array' then raise exception 'invalid todos'; end if;

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
    if backup_row ? 'photo_paths' and jsonb_typeof(backup_row->'photo_paths') is distinct from 'array' then raise exception 'invalid photos'; end if;
    for photo_path in select jsonb_array_elements_text(coalesce(backup_row->'photo_paths','[]'::jsonb)) loop
      if photo_path !~ ('^' || target_household_id::text || '/backup/[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$') or not exists (select 1 from storage.objects o where o.bucket_id='growth-photos' and o.name=photo_path) then raise exception 'invalid restored photo'; end if;
    end loop;
    insert into public.growth_entries (
      household_id, baby_id, title, entry_date, entry_time, category,
      height_cm, weight_kg, head_cm, feeding_ml, feeding_type, feeding_side,
      feeding_minutes, sleep_minutes, temperature_c, diaper_kind, note, photo_paths, created_by
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
      array(select jsonb_array_elements_text(coalesce(backup_row->'photo_paths','[]'::jsonb))),
      actor_id
    );
    growth_count := growth_count + 1;
  end loop;


  for backup_row in select value from jsonb_array_elements(coalesce(p_tables->'family_todos','[]'::jsonb)) loop
    if nullif(backup_row->>'id','') is null or todo_id_map ? (backup_row->>'id') or backup_row->>'visibility' is distinct from 'family' then raise exception 'invalid shared todo'; end if;
    insert into public.family_todos(household_id,title,due_date,assignee,note,recurrence,completed,completed_at,visibility,created_by)
    values(target_household_id,backup_row->>'title',nullif(backup_row->>'due_date','')::date,coalesce(nullif(backup_row->>'assignee',''),'가족'),nullif(backup_row->>'note',''),coalesce(nullif(backup_row->>'recurrence',''),'none'),coalesce((backup_row->>'completed')::boolean,false),nullif(backup_row->>'completed_at','')::timestamptz,'family',actor_id)
    returning id into restored_todo_id;
    todo_id_map := todo_id_map || jsonb_build_object(backup_row->>'id',restored_todo_id::text);
    todos_count := todos_count+1;
  end loop;
  for backup_row in select value from jsonb_array_elements(coalesce(p_tables->'family_todos','[]'::jsonb)) loop
    if nullif(backup_row->>'recurrence_parent_id','') is not null then
      if not todo_id_map ? (backup_row->>'recurrence_parent_id') then raise exception 'unknown todo parent'; end if;
      update public.family_todos set recurrence_parent_id=(todo_id_map->>(backup_row->>'recurrence_parent_id'))::uuid
      where id=(todo_id_map->>(backup_row->>'id'))::uuid and household_id=target_household_id;
    end if;
  end loop;

  update public.household_backup_imports
  set row_counts = jsonb_build_object(
    'babies', babies_count,
    'events', events_count,
    'calendar_members', members_count,
    'growth_entries', growth_count,
      'family_todos', todos_count
  )
  where id = backup_import_id;

  return jsonb_build_object(
    'duplicate', false,
    'row_counts', jsonb_build_object(
      'babies', babies_count,
      'events', events_count,
      'calendar_members', members_count,
      'growth_entries', growth_count,
      'family_todos', todos_count
    )
  );
end;
$$;

revoke all on function public.restore_household_backup_v3(uuid, text, jsonb) from public, anon;
grant execute on function public.restore_household_backup_v3(uuid, text, jsonb) to authenticated;

commit;
