import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, test } from 'vitest';
let db;
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const home='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', baby='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const job='cccccccc-cccc-4ccc-8ccc-cccccccccccc', secret='test-worker-secret';
async function user(id, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`);
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
async function worker(sql) {
  await db.exec('set role anon');
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema family_internal;
 create table auth.users(id uuid primary key); insert into auth.users values('${owner}'),('${other}');
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 create table public.households(id uuid primary key); insert into public.households values('${home}');
 create table public.household_members(household_id uuid,user_id uuid); insert into public.household_members values('${home}','${owner}'),('${home}','${other}');
 create table public.babies(id uuid primary key,household_id uuid,archived_at timestamptz); insert into public.babies values('${baby}','${home}',null);
 create function public.is_household_member(h uuid) returns boolean language sql security definer as $$select exists(select 1 from public.household_members where household_id=h and user_id=auth.uid())$$;`);
 await db.exec(readFileSync('supabase/migrations/20261018100448_parenting_chat_queue.sql','utf8'));
 await db.exec(`insert into family_internal.parenting_workers(user_id,secret_hash) values('${owner}',encode(sha256(convert_to('${secret}','UTF8')),'hex'))`);
},30000);
afterAll(async()=>{await db?.close();});
test('public app persists a question; only its worker claims and completes it; temporary context is erased',async()=>{
 const queued=await user(owner,`select public.enqueue_parenting_question('${job}','${home}','${baby}','테스트 질문','가상 기록','[]') as id`);
 expect(queued.rows[0].id).toBe(job);
 const claimed=await worker(`select public.claim_parenting_question('${secret}') as job`);
 expect(claimed.rows[0].job.question).toBe('테스트 질문');
 expect(claimed.rows[0].job.context).toBe('가상 기록');
 const lease=claimed.rows[0].job.lease;
 await worker(`select public.finish_parenting_question('${secret}','${job}','${lease}','테스트 답변',null)`);
 const rows=await user(owner,'select question,answer,status,context,messages from public.parenting_questions');
 expect(rows.rows).toEqual([{question:'테스트 질문',answer:'테스트 답변',status:'completed',context:'',messages:[]}]);
 expect((await user(other,'select * from public.parenting_questions')).rows).toHaveLength(0);
});
test('anonymous readers, forged authors, wrong worker keys and direct status writes are blocked',async()=>{
 await expect(worker('select * from public.parenting_questions')).rejects.toThrow('permission denied');
 await expect(worker(`select public.claim_parenting_question('wrong')`)).rejects.toThrow('worker authentication required');
 await expect(user(owner,`update public.parenting_questions set answer='forged'`)).rejects.toThrow('permission denied');
 await expect(user(other,`select public.enqueue_parenting_question('${job}','${home}','${baby}','test','','[]')`)).rejects.toThrow('연결된 Mac');
 await expect(user(owner,`select * from family_internal.parenting_workers`)).rejects.toThrow('permission denied');
});
test('idempotency, one pending question, lease checks and stale cleanup prevent duplicate inference',async()=>{
 const id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 const call=`select public.enqueue_parenting_question('${id}','${home}','${baby}','new','records','[]')`;
 await user(owner,call); await user(owner,call);
 await expect(user(owner,`select public.enqueue_parenting_question(gen_random_uuid(),'${home}','${baby}','another','','[]')`)).rejects.toThrow('이전 질문');
 const claimed=(await worker(`select public.claim_parenting_question('${secret}') as job`)).rows[0].job;
 expect((await worker(`select public.claim_parenting_question('${secret}') as job`)).rows[0].job).toBeNull();
 expect((await worker(`select public.finish_parenting_question('${secret}','${id}',gen_random_uuid(),'wrong',null) as ok`)).rows[0].ok).toBe(false);
 await db.exec(`update public.parenting_questions set started_at=now()-interval '4 minutes' where id='${id}'`);
 await worker(`select public.claim_parenting_question('${secret}')`);
 const row=(await user(owner,`select status,context,messages from public.parenting_questions where id='${id}'`)).rows[0];
 expect(row).toEqual({status:'failed',context:'',messages:[]});
 expect((await worker(`select public.finish_parenting_question('${secret}','${id}','${claimed.lease}','late',null) as ok`)).rows[0].ok).toBe(false);
});
test('family membership, child ownership and bounded conversation are checked before enqueue',async()=>{
 await expect(user(owner,`select public.enqueue_parenting_question(gen_random_uuid(),gen_random_uuid(),'${baby}','q','','[]')`)).rejects.toThrow('가족 로그인');
 await expect(user(owner,`select public.enqueue_parenting_question(gen_random_uuid(),'${home}',gen_random_uuid(),'q','','[]')`)).rejects.toThrow('아이 기록');
 await expect(user(owner,`select public.enqueue_parenting_question(gen_random_uuid(),'${home}','${baby}','q','','[{"role":"system","content":"bad"}]')`)).rejects.toThrow('대화 형식');
 const id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 await user(owner,`select public.enqueue_parenting_question('${id}','${home}','${baby}','q','','[]')`);
 await db.exec(`delete from public.household_members where user_id='${owner}'`);
 expect((await user(owner,'select * from public.parenting_questions')).rows).toHaveLength(0);
 expect((await worker(`select public.claim_parenting_question('${secret}') as job`)).rows[0].job).toBeNull();
});
