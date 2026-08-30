import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const read = (path) => {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
};
const operations = read('admin-ops.js');
const admin = read('family-admin.js');
const requests = read('platform-request-admin.js');
const serviceWorker = read('service-worker.js');
const migration = read('supabase/migrations/20260804_platform_admin_operations.sql');
const aclMigration = read('supabase/migrations/20260804_platform_admin_operations_acl.sql');
const rlsMigration = read('supabase/migrations/20260804_platform_admin_operations_rls.sql');
const storageMigration = read('supabase/migrations/20260804_platform_admin_operations_storage.sql');

describe('admin operations dashboard', () => {
  test('renders one compact collapsed card with health, integrity, audit, and export controls', () => {
    expect(operations).toContain('data-admin-operations');
    expect(operations).toMatch(/data-admin-collapsed="true"|dataset\.adminCollapsed = 'true'/);
    expect(operations).toContain('data-admin-card-body');
    expect(operations).toContain('data-ops-health');
    expect(operations).toContain('data-ops-integrity');
    expect(operations).toContain('data-ops-audit');
    expect(operations).toContain('data-ops-export-json');
    expect(operations).toContain('data-ops-export-csv');
  });

  test('uses protected operations and audit RPCs without exporting private entries', () => {
    expect(operations).toContain("get_platform_admin_operations");
    expect(operations).toContain("list_platform_admin_audit_logs");
    expect(operations).toContain("get_platform_admin_export");
    expect(operations).toContain("log_platform_admin_action");
    expect(migration).toContain('private_entries is intentionally excluded');
    expect(operations).toContain("operations_check");
    expect(operations).toContain("export_json");
    expect(operations).toContain("export_csv");
  });

  test('loads the module and bypasses stale service-worker copies', () => {
    expect(admin).toContain('admin-ops.js?v=20260830-auth-recovery-v2');
    expect(serviceWorker).toContain('url.pathname.endsWith("/admin-ops.js")');
  });

  test('records feature request status changes with metadata only', () => {
    expect(requests).toContain("log_platform_admin_action");
    expect(requests).toContain("feature_request_status");
    expect(requests).toContain("target_type: 'feature_request'");
    expect(requests).not.toContain("content: request.content");
  });

  test('protects operations data with admin checks and authenticated-only RPC grants', () => {
    expect(migration).toContain('create table if not exists public.platform_admin_audit_logs');
    expect(migration).toContain('create or replace function public.get_platform_admin_operations()');
    expect(migration).toContain('create or replace function public.get_platform_admin_export()');
    expect(migration).toContain('create or replace function public.log_platform_admin_action(');
    expect(migration).toContain('create or replace function public.list_platform_admin_audit_logs(');
    expect(migration).toContain("if not public.is_platform_admin() then");
    expect(migration).toContain('grant execute on function public.get_platform_admin_export() to authenticated;');
    expect(migration).toContain('revoke all on table public.platform_admin_audit_logs from anon, authenticated;');
    expect(aclMigration).toContain('revoke execute on function public.get_platform_admin_export() from public, anon, service_role;');
    expect(rlsMigration).toContain('platform admins can view audit logs');
    expect(storageMigration).toContain('(storage.foldername(object.name))[1]');
  });
});
