-- Fix array subscripting in the Storage orphan check for PostgreSQL syntax.

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
            when (storage.foldername(object.name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then ((storage.foldername(object.name))[1])::uuid
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
