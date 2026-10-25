import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, test } from 'vitest';
let db;
const author='11111111-1111-4111-8111-111111111111', editor='22222222-2222-4222-8222-222222222222';
const outside='33333333-3333-4333-8333-333333333333';
const home='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', otherHome='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tables=['events','babies','growth_entries','family_todos'];
async function asUser(id,sql){
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`);
 try{return await db.query(sql);}finally{await db.exec('reset role');}
}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 create table public.household_members(household_id uuid,user_id uuid);
 insert into public.household_members values('${home}','${author}'),('${home}','${editor}'),('${otherHome}','${editor}');
 create function public.is_household_member(h uuid) returns boolean language sql security definer as $$select exists(select 1 from public.household_members where household_id=h and user_id=auth.uid())$$;`);
 for(const table of tables){
  // Identity columns and policies match the deployed tables; unrelated data columns are omitted.
  await db.exec(`create table public.${table}(id uuid primary key,household_id uuid not null,created_by uuid not null,title text,visibility text default 'family');
   alter table public.${table} enable row level security;
   grant select,insert,update,delete on public.${table} to authenticated;
   create policy read on public.${table} for select to authenticated using(public.is_household_member(household_id));
   create policy add on public.${table} for insert to authenticated with check(public.is_household_member(household_id) and created_by=auth.uid());
   create policy edit on public.${table} for update to authenticated using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));
   insert into public.${table} values('${home}','${home}','${author}','original','family');`);
 }
 // Preserve the existing todo creator guard and private policies too.
 const todo=readFileSync('supabase/migrations/20260811000000_private_family_todos.sql','utf8');
 await db.exec('drop policy read on family_todos; drop policy add on family_todos; drop policy edit on family_todos;');
 await db.exec(todo.slice(todo.indexOf('create or replace function')));
 await db.exec(readFileSync('supabase/migrations/20261025085332_preserve_family_record_identity.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
for(const table of tables.slice(0,3)){
 test(`${table}: shared upsert edits content but preserves the original author`,async()=>{
  await asUser(editor,`insert into public.${table}(id,household_id,created_by,title) values('${home}','${home}','${editor}','edited') on conflict(id) do update set title=excluded.title,created_by=excluded.created_by`);
  expect((await asUser(author,`select title,created_by from public.${table}`)).rows[0]).toEqual({title:'edited',created_by:author});
  await asUser(editor,`update public.${table} set created_by='${outside}' where id='${home}'`);
  expect((await asUser(author,`select created_by from public.${table}`)).rows[0].created_by).toBe(author);
 });
}
test('records cannot move to another household even when the editor belongs to both',async()=>{
 for(const table of tables) await expect(asUser(editor,`update public.${table} set household_id='${otherHome}' where id='${home}'`)).rejects.toThrow('household cannot change');
});
test('outsiders cannot read or modify; new records still require the actual author',async()=>{
 for(const table of tables){
  expect((await asUser(outside,`select * from public.${table}`)).rows).toHaveLength(0);
  expect((await asUser(outside,`update public.${table} set title='attack' returning id`)).rows).toHaveLength(0);
  await expect(asUser(editor,`insert into public.${table}(id,household_id,created_by) values(gen_random_uuid(),'${home}','${author}')`)).rejects.toThrow('row-level security');
 }
});
test('todo private visibility and explicit creator rejection remain intact',async()=>{
 await expect(asUser(editor,`update public.family_todos set created_by='${editor}'`)).rejects.toThrow('creator cannot change');
 await asUser(author,`update public.family_todos set visibility='private'`);
 expect((await asUser(editor,'select * from family_todos')).rows).toHaveLength(0);
 expect((await asUser(editor,"update family_todos set title='hidden' returning id")).rows).toHaveLength(0);
 const grants=await db.query("select has_function_privilege('authenticated','public.preserve_family_record_identity()','execute') as allowed");
 expect(grants.rows[0].allowed).toBe(false);
});
