-- Supabase projects may have explicit default EXECUTE grants for anon/service_role.
-- Remove them from the platform-admin operations RPCs after creation.

create index if not exists platform_admin_audit_logs_admin_idx
  on public.platform_admin_audit_logs(admin_user_id, occurred_at desc);

drop policy if exists "platform admins can view audit logs" on public.platform_admin_audit_logs;
create policy "platform admins can view audit logs"
  on public.platform_admin_audit_logs for select to authenticated
  using ((select public.is_platform_admin()));

revoke execute on function public.log_platform_admin_action(text, text, uuid, jsonb) from public, anon, service_role;
revoke execute on function public.list_platform_admin_audit_logs(integer) from public, anon, service_role;
revoke execute on function public.get_platform_admin_operations() from public, anon, service_role;
revoke execute on function public.get_platform_admin_export() from public, anon, service_role;

grant execute on function public.log_platform_admin_action(text, text, uuid, jsonb) to authenticated;
grant execute on function public.list_platform_admin_audit_logs(integer) to authenticated;
grant execute on function public.get_platform_admin_operations() to authenticated;
grant execute on function public.get_platform_admin_export() to authenticated;
