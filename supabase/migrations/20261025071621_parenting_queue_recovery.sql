-- Expiry must also run when the Mac is offline. Only trusted RPCs can call this helper.
alter table public.parenting_questions drop constraint parenting_questions_status_check;
alter table public.parenting_questions add constraint parenting_questions_status_check
  check (status in ('queued','processing','completed','failed','cancelled'));

create function family_internal.expire_parenting_questions(u uuid)
returns void language sql set search_path = '' as $$
  update public.parenting_questions set status='failed',error='대기 시간이 지났어요. 질문을 다시 확인하고 보내 주세요.',context='',messages='[]',lease=null,completed_at=now()
    where created_by=u and ((status='queued' and created_at<now()-interval '10 minutes') or (status='processing' and started_at<now()-interval '3 minutes'));
$$;
revoke all on function family_internal.expire_parenting_questions(uuid) from public,anon,authenticated;

create or replace function public.enqueue_parenting_question(p_id uuid, p_household uuid, p_baby uuid, p_question text, p_context text, p_messages jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); existing public.parenting_questions;
begin
  if u is null or not public.is_household_member(p_household) then raise exception '가족 로그인을 확인해 주세요.'; end if;
  if not exists(select 1 from family_internal.parenting_workers where user_id=u) then raise exception '이 계정에 연결된 Mac이 없어요.'; end if;
  if p_baby is not null and not exists(select 1 from public.babies where id=p_baby and household_id=p_household and archived_at is null) then raise exception '아이 기록을 다시 선택해 주세요.'; end if;
  if p_id is null or p_question is null or length(btrim(p_question)) not between 1 and 2000 or p_context is null or length(p_context)>6000 then raise exception '질문 형식을 확인해 주세요.'; end if;
  if p_messages is null or jsonb_typeof(p_messages)<>'array' then raise exception '대화 형식을 확인해 주세요.'; end if;
  if jsonb_array_length(p_messages)>8 or jsonb_array_length(p_messages)%2<>0 or exists(
    select 1 from jsonb_array_elements(p_messages) with ordinality as m(value,n)
    where value->>'role' is distinct from (case when n%2=1 then 'user' else 'assistant' end)
      or jsonb_typeof(value->'content') is distinct from 'string'
      or length(btrim(value->>'content')) not between 1 and (case when n%2=1 then 2000 else 6000 end)
  ) then raise exception '대화 형식을 확인해 주세요.'; end if;
  perform family_internal.expire_parenting_questions(u);
  select * into existing from public.parenting_questions where id=p_id;
  if found then
    if existing.created_by=u and existing.household_id=p_household and existing.baby_id is not distinct from p_baby and existing.question=p_question then return p_id; end if;
    raise exception '질문 식별자를 다시 생성해 주세요.';
  end if;
  insert into public.parenting_questions(id,household_id,baby_id,created_by,question,context,messages)
    values(p_id,p_household,p_baby,u,p_question,p_context,p_messages);
  return p_id;
exception when unique_violation then raise exception '이전 질문의 답변을 기다려 주세요.';
end $$;

create or replace function public.parenting_worker_status()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare u uuid := auth.uid(); result jsonb; pending jsonb;
begin
  if u is null then raise exception '가족 로그인을 확인해 주세요.'; end if;
  perform family_internal.expire_parenting_questions(u);
  select jsonb_build_object('id',q.id,'status',q.status,'created_at',q.created_at,'started_at',q.started_at,
    'baby_id',case when public.is_household_member(q.household_id) then q.baby_id end,
    'household_id',case when public.is_household_member(q.household_id) then q.household_id end)
    into pending from public.parenting_questions q where q.created_by=u and q.status in ('queued','processing');
  select jsonb_build_object('registered',true,'online',coalesce(last_seen_at>now()-interval '150 seconds',false),
    'last_seen_at',last_seen_at,'pending',pending) into result from family_internal.parenting_workers where user_id=u;
  return coalesce(result,jsonb_build_object('registered',false,'online',false,'last_seen_at',null,'pending',pending));
end $$;

create function public.cancel_parenting_question(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); current_status text;
begin
  if u is null then raise exception '가족 로그인을 확인해 주세요.'; end if;
  -- The row lock serializes cancellation with claim/finish; processing jobs cannot be cancelled.
  select status into current_status from public.parenting_questions
    where id=p_id and created_by=u and public.is_household_member(household_id) for update;
  if not found then raise exception '질문을 찾을 수 없어요.'; end if;
  perform family_internal.expire_parenting_questions(u);
  update public.parenting_questions set status='cancelled',context='',messages='[]',lease=null,completed_at=now()
    where id=p_id and status='queued';
  select status into current_status from public.parenting_questions where id=p_id;
  return current_status;
end $$;
revoke all on function public.cancel_parenting_question(uuid) from public,anon,authenticated;
grant execute on function public.cancel_parenting_question(uuid) to authenticated;

create or replace function public.claim_parenting_question(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; job public.parenting_questions;
begin
  update family_internal.parenting_workers set last_seen_at=now()
    where secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex') returning user_id into u;
  if u is null then raise exception 'worker authentication required'; end if;
  perform family_internal.expire_parenting_questions(u);
  select q.* into job from public.parenting_questions q
    where q.created_by=u and q.status='queued'
      and exists(select 1 from public.household_members hm where hm.household_id=q.household_id and hm.user_id=u)
    order by q.created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.parenting_questions set status='processing',started_at=now(),lease=gen_random_uuid() where id=job.id returning * into job;
  return jsonb_build_object('id',job.id,'lease',job.lease,'question',job.question,'context',job.context,'messages',job.messages);
end $$;

create or replace function public.finish_parenting_question(p_secret text,p_id uuid,p_lease uuid,p_answer text,p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  update family_internal.parenting_workers set last_seen_at=now()
    where secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex') returning user_id into u;
  if u is null then raise exception 'worker authentication required'; end if;
  if (p_error is null and (p_answer is null or length(btrim(p_answer)) not between 1 and 6000)) or length(p_error)>300 then raise exception 'invalid response'; end if;
  perform family_internal.expire_parenting_questions(u);
  update public.parenting_questions set answer=case when p_error is null then p_answer else null end,
    error=p_error,status=case when p_error is null then 'completed' else 'failed' end,
    context='',messages='[]',lease=null,completed_at=now()
    where id=p_id and created_by=u and status='processing' and lease=p_lease
      and exists(select 1 from public.household_members hm where hm.household_id=parenting_questions.household_id and hm.user_id=u);
  return found;
end $$;

