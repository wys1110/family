import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {test,expect,beforeAll,afterAll} from 'vitest';
let db;const home='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;
 create function public.is_household_owner(id uuid) returns boolean language sql as $$select id='${home}'::uuid$$;
 create table storage.objects(bucket_id text,name text);
 create table household_backup_imports(id uuid default gen_random_uuid(),household_id uuid,backup_id text,imported_by uuid,row_counts jsonb,unique(household_id,backup_id));
 create table babies(id uuid primary key default gen_random_uuid(),household_id uuid,name text,birth_date date,birth_time time,sex text,birth_weight_kg numeric,birth_height_cm numeric,archived_at timestamptz,created_by uuid);
 create table events(id uuid default gen_random_uuid(),household_id uuid,title text,event_date date,event_end_date date,event_time time,member text,note text,created_by uuid);
 create table calendar_members(id uuid default gen_random_uuid(),household_id uuid,name text,color text,sort_order int,archived_at timestamptz,created_by uuid,unique(household_id,name));
 create table growth_entries(id uuid default gen_random_uuid(),household_id uuid,baby_id uuid references babies(id),title text,entry_date date,entry_time time,category text,height_cm numeric,weight_kg numeric,head_cm numeric,feeding_ml int,feeding_type text,feeding_side text,feeding_minutes int,sleep_minutes int,temperature_c numeric,diaper_kind text,note text,photo_paths text[],created_by uuid);
 `);
 let sql=readFileSync('supabase/migrations/20260716_family_todos.sql','utf8').split('create index')[0].replace('references public.households(id) on delete cascade','').replace('references auth.users(id) on delete cascade','');
 await db.exec(sql);await db.exec("alter table family_todos add column visibility text default 'family';");
 await db.exec(readFileSync('supabase/migrations/20260913100952_backup_photos_and_todos.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
const call=(tables,id='bk-1111111111111111',household=home)=>db.query('select restore_household_backup_v3($1,$2,$3) as result',[household,id,JSON.stringify(tables)]);
const fixture=()=>({babies:[{id:'baby',name:'테스트',birth_date:'2026-06-01'}],events:[],calendar_members:[],growth_entries:[{title:'첫 순간',baby_id:'baby',entry_date:'2026-09-01',head_cm:40,photo_paths:[]}],family_todos:[{id:'one',title:'완료된 일',visibility:'family',completed:true,completed_at:'2026-09-01T00:00:00Z'},{id:'two',title:'다음 일',visibility:'family',recurrence_parent_id:'one'}]});
test('restore preserves photo links, todo completion and recurrence with idempotency',async()=>{
 const tables=fixture();const path=home+'/backup/'+'a'.repeat(64)+'.jpg';tables.growth_entries[0].photo_paths=[path];await db.query('insert into storage.objects values ($1,$2)',['growth-photos',path]);
 expect((await call(tables)).rows[0].result.row_counts.family_todos).toBe(2);
 const rows=(await db.query('select head_cm,photo_paths from growth_entries')).rows;expect(rows[0]).toEqual({head_cm:'40',photo_paths:[path]});
 const todos=(await db.query('select id,title,completed,recurrence_parent_id from family_todos order by title')).rows;
 expect(todos.find(t=>t.title==='다음 일').recurrence_parent_id).toBe(todos.find(t=>t.title==='완료된 일').id);
 expect((await call(tables)).rows[0].result.duplicate).toBe(true);
 expect((await db.query('select count(*) from family_todos')).rows[0].count).toBe(2);
});
test('bad photos and private todos roll back every inserted record',async()=>{
 const tables=fixture();tables.growth_entries[0].photo_paths=['other/private.jpg'];await expect(call(tables,'bk-2222222222222222')).rejects.toThrow('invalid restored photo');
 tables.growth_entries[0].photo_paths=[];tables.family_todos[0].visibility='private';await expect(call(tables,'bk-3333333333333333')).rejects.toThrow('invalid shared todo');
 expect((await db.query('select count(*) from babies')).rows[0].count).toBe(1);
 expect((await db.query('select count(*) from household_backup_imports')).rows[0].count).toBe(1);
});
test('other households and anonymous execution remain blocked',async()=>{
 await expect(call(fixture(),'bk-4444444444444444',actor)).rejects.toThrow('household owner required');
 expect((await db.query("select has_function_privilege('anon','restore_household_backup_v3(uuid,text,jsonb)','execute') as allowed")).rows[0].allowed).toBe(false);
});
