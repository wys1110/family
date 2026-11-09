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

test('private parents reject even household members, while their owner can repeat them', async () => {
  await insert(owner, 1, home, null, 'private');
  expect((await asUser(member, 'select id from public.family_todos')).rows).toEqual([]);
  await expect(insert(member, 2, home, id(1))).rejects.toMatchObject({ code: '42501' });
  await expect(insert(owner, 3, home, id(1), 'private')).resolves.toMatchObject({ rows: [{ id: id(3) }] });
});

test('updates and upserts cannot attach an existing task to a hidden parent', async () => {
  await insert(owner, 1, home);
  await insert(outsider, 2, otherHome);
  await expect(asUser(outsider, 'update public.family_todos set recurrence_parent_id = $1 where id = $2', [id(1), id(2)]))
    .rejects.toMatchObject({ code: '42501' });
  await expect(asUser(outsider, `
    insert into public.family_todos(id, household_id, title, created_by) values ($1, $2, 'Synthetic', $3)
    on conflict(id) do update set recurrence_parent_id = $4
  `, [id(2), otherHome, outsider, id(1)])).rejects.toMatchObject({ code: '42501' });
  expect((await asUser(outsider, 'select recurrence_parent_id from public.family_todos')).rows)
    .toEqual([{ recurrence_parent_id: null }]);
});

test('missing, self and inaccessible parents produce the same permission error', async () => {
  await insert(owner, 1, home);
  for (const parent of [id(1), id(2), id(99)]) {
    await expect(insert(outsider, 2, otherHome, parent)).rejects.toMatchObject({
      code: '42501', message: 'accessible same-household todo parent required',
    });
  }
});

test('family members can repeat shared tasks once, edit children and delete the parent', async () => {
  await insert(owner, 1, home);
  await insert(member, 2, home, id(1));
  await expect(insert(owner, 3, home, id(1))).rejects.toMatchObject({ code: '23505' });
  await asUser(owner, "update public.family_todos set visibility = 'private' where id = $1", [id(1)]);
  await asUser(member, "update public.family_todos set title = 'Updated', recurrence_parent_id = $1 where id = $2", [id(1), id(2)]);
  await asUser(owner, 'delete from public.family_todos where id = $1', [id(1)]);
  expect((await asUser(member, 'select title, recurrence_parent_id from public.family_todos')).rows)
    .toEqual([{ title: 'Updated', recurrence_parent_id: null }]);
});

test('membership in both households still does not permit cross-household relationships', async () => {
  await insert(owner, 1, home);
  await db.query('insert into public.household_members values ($1, $2)', [home, outsider]);
  try {
    expect((await asUser(outsider, 'select id from public.family_todos')).rows).toHaveLength(1);
    await expect(insert(outsider, 2, otherHome, id(1))).rejects.toMatchObject({ code: '42501' });
  } finally {
    await db.query('delete from public.household_members where household_id = $1 and user_id = $2', [home, outsider]);
  }
});

test('migration stops without rewriting old cross-household links', async () => {
  await insert(owner, 1, home);
  await db.exec('alter table public.family_todos disable trigger family_todos_check_recurrence_parent');
  try { await insert(outsider, 2, otherHome, id(1)); }
  finally { await db.exec('alter table public.family_todos enable trigger family_todos_check_recurrence_parent'); }
  const file = readdirSync('supabase/migrations').find(file => file.endsWith('_secure_todo_recurrence_parent.sql'));
  await expect(db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))).rejects.toMatchObject({ code: '23514' });
  await db.exec('rollback');
  expect((await db.query('select id, recurrence_parent_id from public.family_todos order by id')).rows)
    .toEqual([{ id: id(1), recurrence_parent_id: null }, { id: id(2), recurrence_parent_id: id(1) }]);
});
