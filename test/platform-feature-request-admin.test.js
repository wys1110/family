import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const adminModule = readFileSync(new URL('../platform-request-admin.js', import.meta.url), 'utf8');
const loader = readFileSync(new URL('../tab-emojis.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260801_platform_feature_request_admin.sql', import.meta.url), 'utf8');

describe('platform feature request administration', () => {
  it('loads the platform administration module', () => {
    expect(loader).toContain('platform-request-admin.js?v=20260801-v1');
  });

  it('checks platform-admin authorization and uses protected RPCs', () => {
    expect(adminModule).toContain("rpc('is_platform_admin')");
    expect(adminModule).toContain("rpc('list_platform_feature_requests'");
    expect(adminModule).toContain("rpc('update_platform_feature_request_status'");
  });

  it('seeds the confirmed administrator and protects global request access', () => {
    expect(migration).toContain("lower('wys1110@gmail.com')");
    expect(migration).toContain('platform administrator access required');
    expect(migration).toContain('security definer');
    expect(migration).toContain('revoke all on table public.platform_admins from anon, authenticated');
  });
});
