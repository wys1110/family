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
 await db.exec(readFileSync('supabase/migrations/20261025071621_parenting_queue_recovery.sql','utf8'));
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
test('offline status and enqueue expire jobs without a worker, exposing account-wide pending metadata',async()=>{
 const enqueue=`select public.enqueue_parenting_question(gen_random_uuid(),'${home}','${baby}','offline','records','[]') as id`;
 const first=(await user(owner,enqueue)).rows[0].id;
 await db.exec(`update family_internal.parenting_workers set last_seen_at=now()-interval '1 hour'; update public.parenting_questions set created_at=now()-interval '11 minutes' where id='${first}'`);
 let status=(await user(owner,'select public.parenting_worker_status() as status')).rows[0].status;
 expect(status.online).toBe(false); expect(status.registered).toBe(true); expect(status.pending).toBeNull(); expect(status.last_seen_at).toBeTruthy();
 expect((await user(owner,`select status,context,messages from public.parenting_questions where id='${first}'`)).rows[0]).toEqual({status:'failed',context:'',messages:[]});
 const second=(await user(owner,enqueue)).rows[0].id;
 status=(await user(owner,'select public.parenting_worker_status() as status')).rows[0].status;
 expect(status.pending).toMatchObject({id:second,baby_id:baby,household_id:home,status:'queued'});
 expect(status.pending.question).toBeUndefined();
 expect((await user(other,'select public.parenting_worker_status() as status')).rows[0].status.pending).toBeNull();
 await db.exec(`update public.parenting_questions set created_at=now()-interval '11 minutes' where id='${second}'`);
 const third=(await user(owner,enqueue)).rows[0].id;
 expect((await user(owner,`select status from public.parenting_questions where id='${second}'`)).rows[0].status).toBe('failed');
 await user(owner,`select public.cancel_parenting_question('${third}')`);
});
test('cancel wins before claim; claim wins before cancel; other users cannot cancel',async()=>{
 const enqueue=`select public.enqueue_parenting_question(gen_random_uuid(),'${home}','${baby}','cancel','records','[]') as id`;
 const id=(await user(owner,enqueue)).rows[0].id;
 await expect(user(other,`select public.cancel_parenting_question('${id}')`)).rejects.toThrow('질문을 찾을 수');
 await expect(worker(`select public.cancel_parenting_question('${id}')`)).rejects.toThrow('permission denied');
 expect((await user(owner,`select public.cancel_parenting_question('${id}') as status`)).rows[0].status).toBe('cancelled');
 expect((await worker(`select public.claim_parenting_question('${secret}') as job`)).rows[0].job).toBeNull();
 expect((await user(owner,`select status,context,messages from public.parenting_questions where id='${id}'`)).rows[0]).toEqual({status:'cancelled',context:'',messages:[]});
 expect((await user(owner,`select public.enqueue_parenting_question('${id}','${home}','${baby}','cancel','records','[]') as id`)).rows[0].id).toBe(id);
 const next=(await user(owner,enqueue)).rows[0].id;
 const claimed=(await worker(`select public.claim_parenting_question('${secret}') as job`)).rows[0].job;
 expect((await user(owner,`select public.cancel_parenting_question('${next}') as status`)).rows[0].status).toBe('processing');
 await db.exec(`update public.parenting_questions set started_at=now()-interval '4 minutes' where id='${next}'`);
 // Completion itself rejects an expired lease, even without a status poll or another claim.
 expect((await worker(`select public.finish_parenting_question('${secret}','${next}','${claimed.lease}','late',null) as ok`)).rows[0].ok).toBe(false);
 expect((await user(owner,`select status from public.parenting_questions where id='${next}'`)).rows[0].status).toBe('failed');
});
test('two valid worker capabilities cannot claim or complete each other\'s questions',async()=>{
 const otherSecret='other-test-worker-secret';
 await db.exec(`insert into family_internal.parenting_workers(user_id,secret_hash) values('${other}',encode(sha256(convert_to('${otherSecret}','UTF8')),'hex'))`);
 const enqueue=question=>`select public.enqueue_parenting_question(gen_random_uuid(),'${home}','${baby}','${question}','private context','[]') as id`;
 const first=(await user(owner,enqueue('first private question'))).rows[0].id;
 const second=(await user(other,enqueue('second private question'))).rows[0].id;
 const mine=(await worker(`select public.claim_parenting_question('${secret}') as job`)).rows[0].job;
 const theirs=(await worker(`select public.claim_parenting_question('${otherSecret}') as job`)).rows[0].job;
 expect(mine.id).toBe(first); expect(mine.question).toBe('first private question');
 expect(theirs.id).toBe(second); expect(theirs.question).toBe('second private question');
 // Even knowledge of the other job's actual lease must not cross the author boundary.
 expect((await worker(`select public.finish_parenting_question('${secret}','${second}','${theirs.lease}','forged',null) as ok`)).rows[0].ok).toBe(false);
 expect((await worker(`select public.finish_parenting_question('${otherSecret}','${first}','${mine.lease}','forged',null) as ok`)).rows[0].ok).toBe(false);
 expect((await user(owner,`select id from public.parenting_questions where id='${second}'`)).rows).toHaveLength(0);
 expect((await user(other,`select id from public.parenting_questions where id='${first}'`)).rows).toHaveLength(0);
 expect((await worker(`select public.finish_parenting_question('${secret}','${first}','${mine.lease}','first answer',null) as ok`)).rows[0].ok).toBe(true);
 expect((await worker(`select public.finish_parenting_question('${otherSecret}','${second}','${theirs.lease}','second answer',null) as ok`)).rows[0].ok).toBe(true);
});
test('a claimed lease cannot finish after its author leaves the family',async()=>{
 const id=(await user(owner,`select public.enqueue_parenting_question(gen_random_uuid(),'${home}','${baby}','leaving','private records','[]') as id`)).rows[0].id;
 const claimed=(await worker(`select public.claim_parenting_question('${secret}') as job`)).rows[0].job;
 await db.exec(`delete from public.household_members where user_id='${owner}'`);
 expect((await worker(`select public.finish_parenting_question('${secret}','${id}','${claimed.lease}','late',null) as ok`)).rows[0].ok).toBe(false);
 expect((await user(owner,`select id from public.parenting_questions where id='${id}'`)).rows).toHaveLength(0);
 await db.exec(`update public.parenting_questions set started_at=now()-interval '4 minutes' where id='${id}'`);
 await worker(`select public.claim_parenting_question('${secret}')`);
 expect((await db.query(`select status,context,messages,lease from public.parenting_questions where id='${id}'`)).rows[0]).toEqual({status:'failed',context:'',messages:[],lease:null});
 await db.exec(`insert into public.household_members values('${home}','${owner}')`);
});
test('family membership, child ownership and bounded conversation are checked before enqueue',async()=>{
 await expect(user(owner,`select public.enqueue_parenting_question(gen_random_uuid(),gen_random_uuid(),'${baby}','q','','[]')`)).rejects.toThrow('가족 로그인');
 await expect(user(owner,`select public.enqueue_parenting_question(gen_random_uuid(),'${home}',gen_random_uuid(),'q','','[]')`)).rejects.toThrow('아이 기록');
 await expect(user(owner,`select public.enqueue_parenting_question(gen_random_uuid(),'${home}','${baby}','q','','[{"role":"system","content":"bad"}]')`)).rejects.toThrow('대화 형식');
 const id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 await user(owner,`select public.enqueue_parenting_question('${id}','${home}','${baby}','q','','[]')`);
 await db.exec(`delete from public.household_members where user_id='${owner}'`);
 expect((await user(owner,'select * from public.parenting_questions')).rows).toHaveLength(0);
 await expect(user(owner,`select public.cancel_parenting_question('${id}')`)).rejects.toThrow('질문을 찾을 수');
 expect((await worker(`select public.claim_parenting_question('${secret}') as job`)).rows[0].job).toBeNull();
});
