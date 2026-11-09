import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

const owner = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
const home = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherHome = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id = n => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`;
let db;

async function asUser(user, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); }
}

const insert = (user, number, household, parent = null, visibility = 'family') => asUser(user, `
  insert into public.family_todos(id, household_id, title, recurrence, recurrence_parent_id, visibility, created_by)
  values ($1, $2, 'Synthetic recurring task', 'daily', $3, $4, $5) returning id
`, [id(number), household, parent, visibility, user]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    create table public.households(id uuid primary key);
    create table public.household_members(household_id uuid, user_id uuid);
    create function public.is_household_member(h uuid) returns boolean language sql
      security definer set search_path = '' as $$
      select exists(select 1 from public.household_members where household_id = h and user_id = auth.uid())
    $$;
    insert into auth.users values ('${owner}'), ('${member}'), ('${outsider}');
    insert into households values ('${home}'), ('${otherHome}');
    insert into household_members values ('${home}', '${owner}'), ('${home}', '${member}'), ('${otherHome}', '${outsider}');
    create table public.events(id uuid, household_id uuid, created_by uuid);
    create table public.babies(id uuid, household_id uuid, created_by uuid);
    create table public.growth_entries(id uuid, household_id uuid, created_by uuid);
  `);
  const migrations = [
    '20260716_family_todos.sql',
    '20260811000000_private_family_todos.sql',
    '20261025085332_preserve_family_record_identity.sql',
    ...readdirSync('supabase/migrations').filter(file => file.endsWith('_secure_todo_recurrence_parent.sql')),
  ];
  for (const file of migrations) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
}, 30000);
beforeEach(async () => { await db.exec('truncate public.family_todos'); });
afterAll(async () => { await db?.close(); });

test('an outsider cannot reserve another household parent or block its legitimate successor', async () => {
  await insert(owner, 1, home);
  expect((await asUser(outsider, 'select id from public.family_todos')).rows).toEqual([]);
  await expect(insert(outsider, 2, otherHome, id(1))).rejects.toMatchObject({ code: '42501' });
  await expect(insert(owner, 3, home, id(1))).resolves.toMatchObject({ rows: [{ id: id(3) }] });
});
