drop policy if exists "platform admins can view audit logs" on public.platform_admin_audit_logs;
create policy "platform admins can view audit logs"
  on public.platform_admin_audit_logs for select to authenticated
  using ((select public.is_platform_admin()));
