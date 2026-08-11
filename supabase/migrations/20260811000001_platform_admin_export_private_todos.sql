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

  return jsonb_build_object(
    'export_version', '20260811-v1',
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
      from public.family_todos item where item.visibility = 'family'), '[]'::jsonb),
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
