import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';

const read = path => readFileSync(path, 'utf8');
const readme = read('README.md');
const setup = readme.slice(readme.indexOf('## Supabase 연결'), readme.indexOf('```js'));
// Execute the documented fresh-install sequence, not an independent test-only migration list.
const files = [...setup.matchAll(/\]\((supabase\/[^)]+\.sql)\)/g)].map(match => match[1]);
const owner = '11111111-1111-4111-8111-111111111111';
const guesser = '22222222-2222-4222-8222-222222222222';
const expired = '33333333-3333-4333-8333-333333333333';
let db, home;
async function asUser(user, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
beforeAll(async () => {
  db = new PGlite(); // In memory only; no existing DB, credentials or network.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
    -- PGlite-only substitute for pgcrypto; never used by installation SQL.
    create function public.gen_random_bytes(n integer) returns bytea language sql volatile as $$
      select substring(decode(repeat(replace(gen_random_uuid()::text,'-',''),n),'hex') from 1 for n) $$;
    insert into auth.users(id) values ('${owner}'),('${guesser}'),('${expired}');
  `);
  for (const path of files) await db.exec(read(path).replace('create extension if not exists pgcrypto;', ''));
  home = (await asUser(owner, "select create_household('합성 가족') as id")).rows[0].id;
  await asUser(owner, `insert into babies(household_id,name,birth_date,created_by) values ('${home}','합성 아기','2000-01-01','${owner}')`);
}, 30000);
afterAll(async () => { await db?.close(); });

test('README requires the snapshot then existing invite hardening before connecting the app', () => {
  expect(files).toEqual(['supabase/schema.sql', 'supabase/migrations/20260912032358_family_invite_security_parity.sql', 'supabase/migrations/20261025094000_revoke_removed_member_invites.sql']);
  expect(read('supabase/schema.sql')).toContain('Fresh-install step 1 of 3');
});
test('fresh invites are long and expire; only the owner can use invite management RPCs', async () => {
  const result = await asUser(owner, 'select * from get_household_invite()');
  expect(result.rows[0].invite_code).toMatch(/^[0-9A-F]{32}$/);
  const lifetime = await db.query(`select invite_code_expires_at > now() and invite_code_expires_at <= now()+interval '7 days' as valid from households where id='${home}'`);
  expect(lifetime.rows[0].valid).toBe(true);
  await expect(asUser(expired, 'select * from get_household_invite()')).rejects.toThrow('owner access required');
  await expect(asUser(expired, 'select * from rotate_household_invite()')).rejects.toThrow('owner access required');
  const access = await db.query("select has_function_privilege('anon','join_household(text)','execute') as join, has_function_privilege('anon','get_household_invite()','execute') as invite, has_table_privilege('authenticated','household_join_attempts','select') as attempts");
  expect(access.rows[0]).toEqual({ join: false, invite: false, attempts: false });
});
test('failed attempts persist and block even a correct sixth attempt until the window ends', async () => {
  const code = (await asUser(owner, 'select * from get_household_invite()')).rows[0].invite_code;
  for (let i=0;i<5;i++) expect((await asUser(guesser, "select join_household('WRONG') as id")).rows[0].id).toBeNull();
  expect((await asUser(guesser, `select join_household('${code}') as id`)).rows[0].id).toBeNull();
  expect((await asUser(guesser, 'select * from babies')).rows).toEqual([]);
  expect((await db.query(`select attempt_count from household_join_attempts where user_id='${guesser}'`)).rows[0].attempt_count).toBe(6);
  await db.exec(`update household_join_attempts set window_started_at=now()-interval '16 minutes' where user_id='${guesser}'`);
  expect((await asUser(guesser, `select join_household('${code}') as id`)).rows[0].id).toBe(home);
  expect((await asUser(guesser, 'select name from babies')).rows).toEqual([{ name: '합성 아기' }]);
});
test('expired invites are rejected and owner rotation invalidates the previous code', async () => {
  const old = (await asUser(owner, 'select * from get_household_invite()')).rows[0].invite_code;
  await db.exec(`update households set invite_code_expires_at=now()-interval '1 second' where id='${home}'`);
  expect((await asUser(expired, `select join_household('${old}') as id`)).rows[0].id).toBeNull();
  const fresh = (await asUser(owner, 'select * from rotate_household_invite()')).rows[0].invite_code;
  expect(fresh).toMatch(/^[0-9A-F]{32}$/); expect(fresh).not.toBe(old);
  expect((await asUser(expired, `select join_household('${old}') as id`)).rows[0].id).toBeNull();
  expect((await asUser(expired, `select join_household('${fresh}') as id`)).rows[0].id).toBe(home);
});

test('removed members cannot rejoin with a previously issued invitation', async () => {
  const old = (await asUser(owner, 'select * from get_household_invite()')).rows[0].invite_code;
  expect((await asUser(expired, 'select name from babies')).rows).toHaveLength(1);
  expect((await asUser(owner, `select remove_household_member('${expired}') as removed`)).rows[0].removed).toBe(true);
  expect((await asUser(expired, 'select name from babies')).rows).toEqual([]);
  expect((await asUser(expired, `select join_household('${old}') as id`)).rows[0].id).toBeNull();
  const fresh = (await asUser(owner, 'select * from get_household_invite()')).rows[0].invite_code;
  expect(fresh).not.toBe(old);
  expect((await asUser(expired, `select join_household('${fresh}') as id`)).rows[0].id).toBe(home);
});

test('nonowners and no-op removals cannot revoke invitations or remove the owner', async () => {
  const old = (await asUser(owner, 'select * from get_household_invite()')).rows[0].invite_code;
  for (const [actor, target] of [[expired, owner], [owner, owner], [owner, '44444444-4444-4444-8444-444444444444']]) {
    expect((await asUser(actor, `select remove_household_member('${target}') as removed`)).rows[0].removed).toBe(false);
  }
  expect((await asUser(owner, 'select * from get_household_invite()')).rows[0].invite_code).toBe(old);
  expect((await db.query("select has_function_privilege('anon','remove_household_member(uuid)','execute') as allowed")).rows[0].allowed).toBe(false);
});

test('membership removal and invitation revocation roll back together', async () => {
  const old = (await asUser(owner, 'select * from get_household_invite()')).rows[0].invite_code;
  await db.exec('begin');
  try {
    expect((await asUser(owner, `select remove_household_member('${expired}') as removed`)).rows[0].removed).toBe(true);
    expect((await asUser(owner, 'select * from get_household_invite()')).rows[0].invite_code).not.toBe(old);
  } finally { await db.exec('rollback'); }
  expect((await asUser(owner, 'select * from get_household_invite()')).rows[0].invite_code).toBe(old);
  expect((await asUser(expired, 'select name from babies')).rows).toHaveLength(1);
});
