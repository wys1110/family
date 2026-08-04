-- Read-only platform operations, integrity checks, audit, and export.
-- Every function re-checks the platform administrator allowlist at call time.

create table if not exists public.platform_admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in (
    'admin_view', 'operations_check', 'export_json', 'export_csv', 'feature_request_status'
  )),
  target_type text check (target_type is null or char_length(target_type) between 1 and 40),
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists platform_admin_audit_logs_occurred_idx
  on public.platform_admin_audit_logs(occurred_at desc);
create index if not exists platform_admin_audit_logs_admin_idx
  on public.platform_admin_audit_logs(admin_user_id, occurred_at desc);

alter table public.platform_admin_audit_logs enable row level security;
revoke all on table public.platform_admin_audit_logs from anon, authenticated;
drop policy if exists "platform admins can view audit logs" on public.platform_admin_audit_logs;
create policy "platform admins can view audit logs"
  on public.platform_admin_audit_logs for select to authenticated
  using ((select public.is_platform_admin()));

create or replace function public.log_platform_admin_action(
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  safe_metadata jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  if p_action not in ('admin_view', 'operations_check', 'export_json', 'export_csv', 'feature_request_status') then
    raise exception 'invalid platform administrator action' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into safe_metadata
  from jsonb_each(case when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object'
                      then coalesce(p_metadata, '{}'::jsonb) else '{}'::jsonb end) item
  where item.key in ('format', 'next_status', 'warning_count', 'source');

  insert into public.platform_admin_audit_logs(
    admin_user_id, action, target_type, target_id, metadata
  ) values (
    auth.uid(), left(nullif(btrim(p_action), ''), 40),
    left(nullif(btrim(p_target_type), ''), 40), p_target_id, safe_metadata
  );

  delete from public.platform_admin_audit_logs
  where occurred_at < now() - interval '180 days';
end;
$$;

revoke all on function public.log_platform_admin_action(text, text, uuid, jsonb) from public;
revoke execute on function public.log_platform_admin_action(text, text, uuid, jsonb) from anon, service_role;
grant execute on function public.log_platform_admin_action(text, text, uuid, jsonb) to authenticated;

create or replace function public.list_platform_admin_audit_logs(
  p_row_limit integer default 20
)
returns table (
  id bigint,
  admin_user_id uuid,
  admin_email text,
  action text,
  target_type text,
  target_id uuid,
  metadata jsonb,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  return query
  select log.id, log.admin_user_id, users.email::text, log.action,
         log.target_type, log.target_id, log.metadata, log.occurred_at
  from public.platform_admin_audit_logs log
  join auth.users users on users.id = log.admin_user_id
  order by log.occurred_at desc
  limit least(greatest(coalesce(p_row_limit, 20), 1), 100);
end;
$$;

revoke all on function public.list_platform_admin_audit_logs(integer) from public;
revoke execute on function public.list_platform_admin_audit_logs(integer) from anon, service_role;
grant execute on function public.list_platform_admin_audit_logs(integer) to authenticated;

create or replace function public.get_platform_admin_operations()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  storage_orphans bigint := 0;
  integrity jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  if to_regclass('storage.objects') is not null then
    execute $query$
      select count(*)
      from storage.objects object
      where object.bucket_id = 'growth-photos'
        and not exists (
          select 1
          from public.households household
          where household.id = case
            when storage.foldername(object.name)[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then storage.foldername(object.name)[1]::uuid
            else null
          end
        )
    $query$ into storage_orphans;
  end if;

  select jsonb_build_array(
    jsonb_build_object(
      'key', 'ungrouped_users', 'label', '그룹 미가입 사용자',
      'count', (select count(*) from auth.users user_row where not exists (
        select 1 from public.household_members member where member.user_id = user_row.id
      )), 'severity', 'warning'
    ),
    jsonb_build_object(
      'key', 'empty_households', 'label', '구성원 없는 가족 그룹',
      'count', (select count(*) from public.households household where not exists (
        select 1 from public.household_members member where member.household_id = household.id
      )), 'severity', 'warning'
    ),
    jsonb_build_object(
      'key', 'owner_mismatches', 'label', '가족 관리자 연결 불일치',
      'count', (select count(*) from public.households household where not exists (
        select 1 from public.household_members member
        where member.household_id = household.id and member.user_id = household.owner_id and member.role = 'owner'
      )), 'severity', 'error'
    ),
    jsonb_build_object(
      'key', 'baby_profile_mismatches', 'label', '아기 AI 가족 불일치',
      'count', (select count(*) from public.baby_ai_profiles profile
        join public.babies baby on baby.id = profile.baby_id
        where profile.household_id <> baby.household_id), 'severity', 'error'
    ),
    jsonb_build_object(
      'key', 'growth_baby_mismatches', 'label', '성장 기록 가족 불일치',
      'count', (select count(*) from public.growth_entries entry
        join public.babies baby on baby.id = entry.baby_id
        where entry.baby_id is not null and entry.household_id <> baby.household_id), 'severity', 'error'
    ),
    jsonb_build_object(
      'key', 'storage_orphans', 'label', '연결 끊긴 사진 파일',
      'count', storage_orphans, 'severity', 'warning'
    )
  ) into integrity;

  return jsonb_build_object(
    'generated_at', now(),
    'health', jsonb_build_object(
      'database', 'ok',
      'activity_last_at', (select max(occurred_at) from public.app_activity_logs),
      'activity_24h', (select count(*) from public.app_activity_logs where occurred_at >= now() - interval '24 hours'),
      'audit_last_at', (select max(occurred_at) from public.platform_admin_audit_logs),
      'open_requests', (select count(*) from public.feature_requests where status not in ('done', 'dismissed'))
    ),
    'integrity', integrity
  );
end;
$$;

revoke all on function public.get_platform_admin_operations() from public;
revoke execute on function public.get_platform_admin_operations() from anon, service_role;
grant execute on function public.get_platform_admin_operations() to authenticated;

create or replace function public.get_platform_admin_export()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  -- private_entries is intentionally excluded: it is a personal space, not platform data.
  return jsonb_build_object(
    'export_version', '20260804-v1',
    'generated_at', now(),
    'users', coalesce((select jsonb_agg(jsonb_build_object(
      'id', user_row.id, 'email', user_row.email, 'name', nullif(trim(coalesce(
        user_row.raw_user_meta_data ->> 'full_name', user_row.raw_user_meta_data ->> 'name', ''
      )), ''), 'created_at', user_row.created_at, 'last_sign_in_at', user_row.last_sign_in_at
    ) order by user_row.created_at desc) from auth.users user_row), '[]'::jsonb),
    'households', coalesce((select jsonb_agg(jsonb_build_object(
      'id', household.id, 'name', household.name, 'owner_id', household.owner_id, 'created_at', household.created_at
    ) order by household.created_at desc) from public.households household), '[]'::jsonb),
    'household_members', coalesce((select jsonb_agg(to_jsonb(member) order by member.created_at)
      from public.household_members member), '[]'::jsonb),
    'babies', coalesce((select jsonb_agg(to_jsonb(baby) order by baby.created_at)
      from public.babies baby), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at)
      from public.events item), '[]'::jsonb),
    'growth_entries', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at)
      from public.growth_entries item), '[]'::jsonb),
    'family_todos', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at)
      from public.family_todos item), '[]'::jsonb),
    'feature_requests', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at)
      from public.feature_requests item), '[]'::jsonb),
    'baby_ai_profiles', coalesce((select jsonb_agg(to_jsonb(item) order by item.updated_at)
      from public.baby_ai_profiles item), '[]'::jsonb),
    'baby_ai_strategy_drafts', coalesce((select jsonb_agg(to_jsonb(item) order by item.generated_at)
      from public.baby_ai_strategy_drafts item), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at)
      from public.notifications item), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_platform_admin_export() from public;
revoke execute on function public.get_platform_admin_export() from anon, service_role;
grant execute on function public.get_platform_admin_export() to authenticated;

comment on table public.platform_admin_audit_logs is
  'Minimal administrator operation audit log. It never stores private app content.';
