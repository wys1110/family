import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, expect, test } from 'vitest';

const home='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner='11111111-1111-4111-8111-111111111111', member='22222222-2222-4222-8222-222222222222', outsider='33333333-3333-4333-8333-333333333333';
const wallpaper=`${home}/wallpapers/calendar/photo.jpg`, photo=`${home}/baby/photo.jpg`;
const read=path=>readFileSync(path,'utf8');
describe.each(['migration','fresh schema'])('Storage authorization: %s',source=>{
 let db;
 async function asUser(user,sql,params=[]){
  await db.exec('set role authenticated');
  try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);return await db.query(sql,params);}
  finally{await db.exec('reset role');}
 }
 beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role authenticated; create schema auth; create schema storage;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,storage to authenticated;
   create table public.households(id uuid primary key,owner_id uuid);
   create table public.household_members(household_id uuid,user_id uuid);
   insert into public.households values('${home}','${owner}');
   insert into public.household_members values('${home}','${owner}'),('${home}','${member}');
   create function public.is_household_member(target_household uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.household_members where household_id=target_household and user_id=auth.uid())$$;
   create function public.is_household_owner(target_household uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.households where id=target_household and owner_id=auth.uid())$$;
   create function storage.foldername(name text) returns text[] language plpgsql immutable as $$declare parts text[]; begin parts:=string_to_array(name,'/'); return parts[1:array_length(parts,1)-1]; end$$;
   create table storage.objects(bucket_id text,name text,metadata jsonb default '{}',unique(bucket_id,name));
   alter table storage.objects enable row level security;
   grant select,insert,update,delete on storage.objects to authenticated;`);
  // Execute actual policy SQL; object metadata stands in for a file replacement.
  const sql=read(source==='migration'?'supabase/migrations/20260715_growth_records_and_photos.sql':'supabase/schema.sql');
  for(const policy of sql.matchAll(/create policy "family can [^"]+ growth photos" on storage\.objects[\s\S]*?;/g)) await db.exec(policy[0]);
  if(source==='migration') await db.exec(read('supabase/migrations/20261025090311_protect_wallpaper_objects.sql'));
 },30000);
 beforeEach(async()=>{
  await db.exec('truncate storage.objects');
  await db.query("insert into storage.objects(bucket_id,name) values('growth-photos',$1),('growth-photos',$2),('other-bucket',$1)",[wallpaper,photo]);
 });
 afterAll(async()=>{await db?.close();});
 test('family can read wallpaper and growth photo, outsiders cannot',async()=>{
  expect((await asUser(member,'select name from storage.objects')).rows).toHaveLength(2);
  expect((await asUser(outsider,'select name from storage.objects')).rows).toHaveLength(0);
 });
 test('members cannot upload wallpaper or overwrite it with upsert',async()=>{
  for(const name of [wallpaper,`${home}/wallpapers/growth/new.jpg`]) await expect(asUser(member,"insert into storage.objects(bucket_id,name) values('growth-photos',$1) on conflict(bucket_id,name) do update set metadata='{}'",[name])).rejects.toThrow('row-level security');
 });
 test('members cannot replace, delete, or move wallpaper out of its folder',async()=>{
  expect((await asUser(member,"update storage.objects set metadata='{\"changed\":true}' where name=$1 returning name",[wallpaper])).rows).toHaveLength(0);
  expect((await asUser(member,'update storage.objects set name=$1 where name=$2 returning name',[`${home}/baby/stolen.jpg`,wallpaper])).rows).toHaveLength(0);
  expect((await asUser(member,'delete from storage.objects where name=$1 returning name',[wallpaper])).rows).toHaveLength(0);
 });
 test('members cannot move a growth photo into the wallpaper folder',async()=>{
  await expect(asUser(member,'update storage.objects set name=$1 where name=$2',[`${home}/wallpapers/growth/moved.jpg`,photo])).rejects.toThrow('row-level security');
 });
 test('owner can upload, overwrite, replace and delete wallpaper',async()=>{
  const name=`${home}/wallpapers/growth/new.jpg`;
  for(let i=0;i<2;i++) expect((await asUser(owner,"insert into storage.objects(bucket_id,name) values('growth-photos',$1) on conflict(bucket_id,name) do update set metadata='{}' returning name",[name])).rows).toHaveLength(1);
  expect((await asUser(owner,"update storage.objects set metadata='{\"changed\":true}' where name=$1 returning name",[name])).rows).toHaveLength(1);
  expect((await asUser(owner,'delete from storage.objects where name=$1 returning name',[name])).rows).toHaveLength(1);
 });
 test('members retain shared growth and backup photo management',async()=>{
  for(const name of [`${home}/baby/new.jpg`,`${home}/backup/new.jpg`]){
   expect((await asUser(member,"insert into storage.objects(bucket_id,name) values('growth-photos',$1) returning name",[name])).rows).toHaveLength(1);
   expect((await asUser(member,"update storage.objects set metadata='{}' where name=$1 returning name",[name])).rows).toHaveLength(1);
   expect((await asUser(member,'delete from storage.objects where name=$1 returning name',[name])).rows).toHaveLength(1);
  }
 });
 test('outsiders and other buckets still cannot be modified',async()=>{
  await expect(asUser(outsider,"insert into storage.objects(bucket_id,name) values('growth-photos',$1)",[`${home}/baby/attack.jpg`])).rejects.toThrow('row-level security');
  expect((await asUser(outsider,"update storage.objects set metadata='{}' returning name")).rows).toHaveLength(0);
  expect((await asUser(outsider,'delete from storage.objects returning name')).rows).toHaveLength(0);
  await expect(asUser(owner,"insert into storage.objects(bucket_id,name) values('other-bucket',$1)",[`${home}/wallpapers/growth/attack.jpg`])).rejects.toThrow('row-level security');
  expect((await asUser(owner,"delete from storage.objects where bucket_id='other-bucket' returning name")).rows).toHaveLength(0);
 });
});
