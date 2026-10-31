import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, test } from 'vitest';
let db;
const owner='11111111-1111-4111-8111-111111111111', member='22222222-2222-4222-8222-222222222222', outsider='33333333-3333-4333-8333-333333333333';
const home='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', baby='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sid=n=>`cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12,'0')}`;
async function asUser(user, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
const change=async(user,id,action,extra='null,null')=>(await asUser(user,`select change_family_sleep('${home}','${baby}','${id}','${action}',${extra}) as result`)).rows[0].result;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    create table public.households(id uuid primary key);
    create table public.household_members(household_id uuid,user_id uuid);
    create table public.babies(id uuid primary key,household_id uuid,archived_at timestamptz,unique(id,household_id));
    create table public.growth_entries(id uuid primary key,household_id uuid,baby_id uuid,title text,entry_date date,entry_time time,category text,sleep_minutes integer check(sleep_minutes between 1 and 1440),note text,created_by uuid);
    create function public.is_household_member(h uuid) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.household_members where household_id=h and user_id=auth.uid()) $$;
    insert into auth.users values('${owner}'),('${member}'),('${outsider}');
    insert into households values('${home}');
    insert into babies values('${baby}','${home}',null);
    insert into household_members values('${home}','${owner}'),('${home}','${member}');
  `);
  const sql=readFileSync('supabase/migrations/20261031094052_shared_family_sleep.sql','utf8');
  // PGlite has no WAL publication support; exercise the exact tables/functions/RLS.
  await db.exec(sql.replace('alter publication supabase_realtime add table public.family_sleep_sessions;',''));
},30000);
afterAll(async()=>{await db?.close();});
test('two family members share the same active start and stop records exactly once',async()=>{
  const first=await change(owner,sid(1),'start');
  const second=await change(member,sid(2),'start');
  expect(second.session.id).toBe(first.session.id);
  expect(second.session.started_at).toBe(first.session.started_at);
  expect((await asUser(member,'select * from family_sleep_sessions')).rows).toHaveLength(1);
  const ended=await change(member,sid(1),'stop');
  const retried=await change(owner,sid(1),'stop');
  expect(retried).toEqual(ended);
  expect((await db.query('select * from growth_entries')).rows).toHaveLength(1);
  expect(ended.entry.created_by).toBe(member);
  expect(ended.entry.sleep_minutes).toBe(1);
});
test('lost start responses and colliding starts never restart a finished session',async()=>{
  const retry=await change(member,sid(2),'start');
  expect(retry.session.id).toBe(sid(1)); expect(retry.session.ended_at).toBeTruthy();
  expect((await db.query('select * from family_sleep_sessions where ended_at is null')).rows).toHaveLength(0);
});
test('outsiders cannot read or mutate family sleep and direct table writes are denied',async()=>{
  expect((await asUser(outsider,'select * from family_sleep_sessions')).rows).toHaveLength(0);
  await expect(change(outsider,sid(3),'start')).rejects.toThrow('family access required');
  await expect(asUser(owner,"update family_sleep_sessions set ended_at=null")).rejects.toThrow('permission denied');
  await expect(asUser(owner,'select * from family_sleep_internal.start_requests')).rejects.toThrow('permission denied');
  const privileges=(await db.query("select has_function_privilege('anon','public.change_family_sleep(uuid,uuid,uuid,text,timestamptz,timestamptz)','execute') as allowed")).rows[0];
  expect(privileges.allowed).toBe(false);
});
test('cancel is shared and retries cannot turn it into a completed record',async()=>{
  await change(owner,sid(3),'start');
  const cancelled=await change(member,sid(3),'cancel');
  expect(cancelled.session.cancelled_at).toBeTruthy();
  const stopped=await change(owner,sid(3),'stop');
  expect(stopped.entry).toBeNull(); expect(stopped.session).toEqual(cancelled.session);
});
test('record insert failure rolls back the end state',async()=>{
  await change(owner,sid(4),'start');
  await db.exec(`insert into growth_entries(id) values('${sid(4)}');`);
  await expect(change(member,sid(4),'stop')).rejects.toThrow('duplicate key');
  expect((await db.query(`select ended_at from family_sleep_sessions where id='${sid(4)}'`)).rows[0].ended_at).toBeNull();
  await db.exec(`delete from growth_entries where id='${sid(4)}'`);
  await change(owner,sid(4),'cancel');
});
test('cross-midnight duration and first end time survive retry; deleted records stay deleted',async()=>{
  await change(owner,sid(5),'start');
  // Only the test administrator can adjust the clock fixture.
  await db.exec(`update family_sleep_sessions set started_at='2026-10-30T14:30:00Z' where id='${sid(5)}'`);
  const ended=await change(member,sid(5),'stop',"null,'2026-10-30T16:00:00Z'");
  expect(ended.entry).toMatchObject({entry_date:'2026-10-30',entry_time:'23:30:00',sleep_minutes:90});
  const retry=await change(owner,sid(5),'stop',"null,'2026-10-30T16:40:00Z'");
  expect(retry).toEqual(ended);
  await db.exec(`delete from growth_entries where id='${sid(5)}'`);
  expect((await change(owner,sid(5),'stop')).entry).toBeNull();
});
test('removed members and mismatched baby identities cannot change timers',async()=>{
  await db.exec(`delete from household_members where user_id='${member}'`);
  await expect(change(member,sid(6),'start')).rejects.toThrow('family access required');
  expect((await asUser(member,'select * from family_sleep_sessions')).rows).toHaveLength(0);
  await expect(asUser(owner,`select change_family_sleep('${home}','${sid(99)}','${sid(6)}','start')`)).rejects.toThrow('active family baby required');
});
