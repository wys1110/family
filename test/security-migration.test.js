import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, test } from 'vitest';

let db;
const owner = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
const home = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const event = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function asUser(id, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false); select set_config('request.jwt.claim.role','authenticated',false);`);
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
    grant usage on schema auth to authenticated,anon,service_role;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    -- pgcrypto stand-in for the local harness only; production uses gen_random_bytes.
    create function public.gen_random_bytes(n integer) returns bytea language sql volatile as $$
      select substring(decode(repeat(replace(gen_random_uuid()::text,'-',''),n),'hex') from 1 for n) $$;
    create table public.households(id uuid primary key,name text,owner_id uuid,invite_code text not null,created_at timestamptz default now());
    create table public.household_members(household_id uuid,user_id uuid,role text default 'member',created_at timestamptz default now(),primary key(household_id,user_id));
    create table public.events(id uuid primary key,household_id uuid,title text,event_date date,event_end_date date,event_time time,member text);
    create table public.growth_entries(id uuid primary key,household_id uuid,title text,entry_date date,category text);
    create table public.push_subscriptions(id uuid default gen_random_uuid(),user_id uuid,household_id uuid,endpoint text unique,p256dh text,auth text,timezone text,briefing_time time,enabled boolean,briefing_enabled boolean,updated_at timestamptz,last_error text);
    create function public.is_household_member(h uuid) returns boolean language sql security definer as $$ select exists(select 1 from public.household_members where household_id=h and user_id=auth.uid()) $$;
    grant execute on function public.is_household_member(uuid) to authenticated;
    grant select,insert,update,delete on public.events,public.growth_entries to authenticated;
    alter table public.events enable row level security;
    create policy family on public.events to authenticated using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));
    insert into auth.users(id) values ('${owner}'),('${member}'),('${outsider}');
    insert into public.households(id,owner_id,invite_code) values ('${home}','${owner}','ABCDEF');
    insert into public.household_members(household_id,user_id,role) values ('${home}','${owner}','owner'),('${home}','${member}','member');
  `);
  for (const path of ['20260912032052_family_security_hardening.sql','20260912032358_family_invite_security_parity.sql']) {
    await db.exec(readFileSync(`supabase/migrations/${path}`, 'utf8'));
  }
}, 30000);
afterAll(async () => { await db?.close(); });

test('committed changes are canonical, actor scoped and claimable only once', async () => {
  await asUser(owner, `insert into events values('${event}','${home}','실제 일정','2026-09-12','2026-09-12','09:00','가족')`);
  const wrongActor = await asUser(member, `select claim_family_notification_change('${home}','event','${event}') as change`);
  expect(wrongActor.rows[0].change).toBeNull();
  await expect(asUser(outsider, `select claim_family_notification_change('${home}','event','${event}')`)).rejects.toThrow('family access required');
  const actual = await asUser(owner, `select claim_family_notification_change('${home}','event','${event}') as change`);
  expect(actual.rows[0].change.title).toBe('실제 일정');
  expect(actual.rows[0].change.kind).toBe('created');
  const replay = await asUser(owner, `select claim_family_notification_change('${home}','event','${event}') as change`);
  expect(replay.rows[0].change).toBeNull();
});
test('delete snapshots survive deletion without trusting browser content', async () => {
  await asUser(owner, `delete from events where id='${event}'`);
  const result = await asUser(owner, `select claim_family_notification_change('${home}','event','${event}') as change`);
  expect(result.rows[0].change).toMatchObject({ title: '실제 일정', kind: 'deleted' });
});
test('failed transaction creates no notification evidence', async () => {
  await db.exec(`begin; select set_config('request.jwt.claim.sub','${owner}',true); insert into events values('${event}','${home}','rollback','2026-09-12','2026-09-12',null,'가족'); rollback;`);
  const result = await asUser(owner, `select claim_family_notification_change('${home}','event','${event}') as change`);
  expect(result.rows[0].change).toBeNull();
});
test('AI budget stops at 20; direct table resets and anon RPCs are forbidden', async () => {
  for (let i=0;i<21;i++) {
    const result = await asUser(owner, `select consume_family_action_budget('${home}','ai') as ok`);
    expect(result.rows[0].ok).toBe(i<20);
  }
  await expect(asUser(owner, `delete from family_internal.action_budgets`)).rejects.toThrow('permission denied');
  const grants = await db.query(`select has_function_privilege('anon','public.join_household(text)','execute') as invite, has_function_privilege('anon','public.claim_family_notification_change(uuid,text,uuid)','execute') as changes`);
  expect(grants.rows[0]).toEqual({invite:false,changes:false});
});
test('push endpoints cannot be reassigned; removing membership disables delivery', async () => {
  const payload = JSON.stringify({endpoint:'https://web.push.apple.com/example',p256dh:'test',auth:'test',timezone:'Asia/Seoul',briefing_time:'09:00',enabled:true,briefing_enabled:true});
  await asUser(member, `select register_family_push_subscription('${home}','${payload}')`);
  await expect(asUser(owner, `select register_family_push_subscription('${home}','${payload}')`)).rejects.toThrow('subscription belongs to another account');
  await asUser(owner, `select remove_household_member('${member}')`);
  const sub = await db.query('select enabled,briefing_enabled from push_subscriptions');
  expect(sub.rows[0]).toEqual({enabled:false,briefing_enabled:false});
});
test('invites rotate to long tokens and unsuccessful attempts persist', async () => {
  const invite = await asUser(owner, `select * from get_household_invite()`);
  expect(invite.rows[0].invite_code).toMatch(/^[A-F0-9]{32}$/);
  for(let i=0;i<5;i++) await asUser(outsider, `select join_household('WRONG')`);
  const denied = await asUser(outsider, `select join_household('${invite.rows[0].invite_code}') as joined`);
  expect(denied.rows[0].joined).toBeNull();
  const attempts = await db.query(`select attempt_count from household_join_attempts where user_id='${outsider}'`);
  expect(attempts.rows[0].attempt_count).toBe(6);
});
