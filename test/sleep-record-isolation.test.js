import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, afterEach, expect, test } from 'vitest';

const uid = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const owner = uid(1), member = uid(2), outsider = uid(3), home = uid(10), otherHome = uid(11), baby = uid(20), otherBaby = uid(21);
const legacy = uid(100), deleted = uid(101), active = uid(102), alias = uid(103);
let db;
async function asUser(user, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
async function change(user, id, action, h = home, b = baby) {
  return (await asUser(user, `select change_family_sleep('${h}','${b}','${id}','${action}') as result`)).rows[0].result;
}
const insert = (id, h, b, user) => `insert into growth_entries(id,household_id,baby_id,title,entry_date,category,created_by) values('${id}','${h}','${b}','synthetic','2026-11-12','수면','${user}')`;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    create table households(id uuid primary key);
    create table household_members(household_id uuid,user_id uuid);
    create table babies(id uuid primary key,household_id uuid,archived_at timestamptz,unique(id,household_id));
    create table growth_entries(id uuid primary key default gen_random_uuid(),household_id uuid,baby_id uuid,title text,entry_date date,entry_time time,category text,sleep_minutes integer check(sleep_minutes between 1 and 1440),note text,created_by uuid);
    create function is_household_member(h uuid) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.household_members where household_id=h and user_id=auth.uid()) $$;
    insert into auth.users values('${owner}'),('${member}'),('${outsider}');
    insert into households values('${home}'),('${otherHome}');
    insert into babies values('${baby}','${home}',null),('${otherBaby}','${otherHome}',null);
    insert into household_members values('${home}','${owner}'),('${home}','${member}'),('${otherHome}','${outsider}');
    alter table growth_entries enable row level security;
    grant select,insert,update,delete on growth_entries to authenticated;
  `);
  // Use the real growth policies; the other household's insert must be legal.
  const schema = readFileSync('supabase/schema.sql', 'utf8');
  await db.exec([...schema.matchAll(/create policy "members can [^"]+ growth entries"[^;]+;/g)].map(m => m[0]).join('\n'));
  await db.exec(readFileSync('supabase/migrations/20261031094052_shared_family_sleep.sql', 'utf8').replace('alter publication supabase_realtime add table public.family_sleep_sessions;', ''));
  for (const id of [legacy, deleted]) { await change(owner, id, 'start'); await change(member, id, 'stop'); }
  await asUser(owner, `delete from growth_entries where id='${deleted}'`);
  await change(owner, active, 'start'); await change(member, alias, 'start');
  await db.exec(readFileSync('supabase/migrations/20261112003458_isolate_sleep_growth_records.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
afterEach(async () => {
  await db.exec("drop trigger if exists reject_test_sleep on growth_entries; update family_sleep_sessions set cancelled_at=clock_timestamp() where ended_at is null and cancelled_at is null;");
});

test('upgrade retains legacy records, deleted history, active timers, and start aliases', async () => {
  expect((await change(owner, legacy, 'stop')).entry.id).toBe(legacy);
  await asUser(owner, insert(deleted, home, baby, owner));
  expect((await change(owner, deleted, 'stop')).entry).toBeNull();
  expect((await change(member, alias, 'start')).session.id).toBe(active);
  const ended = await change(member, active, 'stop');
  expect(ended.entry.id).not.toBe(active);
  expect((await change(owner, alias, 'start')).session.ended_at).toBe(ended.session.ended_at);
});

test('an outsider cannot block stop by occupying the known session ID', async () => {
  const id = uid(200); await change(owner, id, 'start');
  await asUser(outsider, insert(id, otherHome, otherBaby, outsider));
  const ended = await change(member, id, 'stop');
  expect(ended.entry.id).not.toBe(id);
  expect(ended.session.growth_entry_id).toBe(ended.entry.id);
  expect(ended.entry).toMatchObject({ household_id: home, baby_id: baby, created_by: member, sleep_minutes: 1 });
  expect(await change(owner, id, 'stop')).toEqual(ended);
  expect((await asUser(owner, `select * from growth_entries where id='${id}'`)).rows).toEqual([]);
  expect((await asUser(outsider, `select * from growth_entries where id='${id}'`)).rows).toHaveLength(1);
  expect((await asUser(owner, `select * from growth_entries where id='${ended.entry.id}'`)).rows).toHaveLength(1);
  await asUser(owner, `delete from growth_entries where id='${ended.entry.id}'`);
  await asUser(owner, insert(ended.entry.id, home, baby, owner));
  expect((await change(owner, id, 'stop')).entry).toBeNull();
});

test('a real record insertion failure still rolls back the session end and permits retry', async () => {
  const id = uid(201); await change(owner, id, 'start');
  await db.exec(`create function reject_test_sleep() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$;
    create trigger reject_test_sleep before insert on growth_entries for each row execute function reject_test_sleep();`);
  await expect(change(owner, id, 'stop')).rejects.toThrow('synthetic failure');
  expect((await db.query(`select ended_at,growth_entry_id from family_sleep_sessions where id='${id}'`)).rows[0]).toEqual({ ended_at: null, growth_entry_id: null });
  await db.exec('drop trigger reject_test_sleep on growth_entries;');
  const ended = await change(owner, id, 'stop');
  expect(ended.entry).toBeTruthy(); expect(await change(member, id, 'stop')).toEqual(ended);
});

test('stop and cancel cannot distinguish another family session from a missing one', async () => {
  const id = uid(202); await change(owner, id, 'start');
  for (const action of ['stop', 'cancel']) {
    await expect(change(outsider, id, action, otherHome, otherBaby)).rejects.toThrow('sleep session missing');
    await expect(change(outsider, uid(999), action, otherHome, otherBaby)).rejects.toThrow('sleep session missing');
  }
  expect((await asUser(outsider, 'select * from family_sleep_sessions')).rows).toEqual([]);
  await expect(asUser(owner, `update family_sleep_sessions set ended_at=now() where id='${id}'`)).rejects.toThrow('permission denied');
  expect((await change(member, id, 'cancel')).entry).toBeNull();
  expect((await change(owner, id, 'stop')).entry).toBeNull();
});
