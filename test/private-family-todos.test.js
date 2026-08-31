import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

describe('private and family todo scopes', () => {
  test('migration preserves existing todos as family scope and makes personal rows owner-only', () => {
    const migration = read('supabase/migrations/20260811000000_private_family_todos.sql');
    const adminExportMigration = read('supabase/migrations/20260811000001_platform_admin_export_private_todos.sql');

    expect(migration).toContain("add column if not exists visibility text not null default 'family'");
    expect(migration).toContain("visibility in ('family', 'private')");
    expect(migration).toContain('prevent_family_todo_creator_change');
    expect(migration).toContain("visibility = 'family' or created_by = (select auth.uid())");
    expect(migration).toContain('with check (');
    expect(migration).toContain("created_by = (select auth.uid())");
    expect(adminExportMigration).toContain("from public.family_todos item where item.visibility = 'family'");
  });

  test('todo UI persists scope and exposes only family rows to shared consumers', () => {
    const todoSource = read('family-todo.js');
    const notifications = read('notification-center.js');

    expect(todoSource).toContain("const VALID_SCOPES = new Set(['family', 'private'])");
    expect(todoSource).toContain('data-todo-scope');
    expect(todoSource).toContain("visibility: todo.visibility === 'private' ? 'private' : 'family'");
    expect(todoSource).toContain('getFamilySnapshot');
    expect(todoSource).toContain("new MutationObserver(() => {");
    expect(notifications).toContain(".eq('visibility', 'family')");
    expect(notifications).toContain("filter((todo) => todo.visibility === 'family')");
  });

  test('canonical schema uses the same private owner predicate as the migration', () => {
    const schema = read('supabase/schema.sql');

    expect(schema).toContain("visibility text not null default 'family'");
    expect(schema).toContain("visibility = 'family' or created_by = (select auth.uid())");
  });
});
