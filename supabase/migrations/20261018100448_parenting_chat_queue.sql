-- The Mac gets a narrow queue capability, never a database service-role key.
create table family_internal.parenting_workers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secret_hash text not null unique check (length(secret_hash) = 64),
  last_seen_at timestamptz
);
revoke all on family_internal.parenting_workers from public, anon, authenticated;
alter table family_internal.parenting_workers enable row level security;

create table public.parenting_questions (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  baby_id uuid references public.babies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  question text not null check (length(btrim(question)) between 1 and 2000),
  answer text check (length(answer) <= 6000),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  error text check (length(error) <= 300),
  context text not null default '' check (length(context) <= 6000),
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array' and octet_length(messages::text) <= 40000),
  lease uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index parenting_questions_owner_recent on public.parenting_questions(created_by,household_id,created_at desc);
create index parenting_questions_baby on public.parenting_questions(baby_id);
create index parenting_questions_household on public.parenting_questions(household_id);
create unique index parenting_questions_one_pending on public.parenting_questions(created_by) where status in ('queued','processing');
alter table public.parenting_questions enable row level security;
revoke all on public.parenting_questions from public, anon, authenticated;
grant select on public.parenting_questions to authenticated;
create policy "authors read own family questions" on public.parenting_questions for select to authenticated
  using (created_by = (select auth.uid()) and public.is_household_member(household_id));

create function public.enqueue_parenting_question(p_id uuid, p_household uuid, p_baby uuid, p_question text, p_context text, p_messages jsonb)
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

create function public.parenting_worker_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('registered',exists(select 1 from family_internal.parenting_workers where user_id=auth.uid()),
    'online',coalesce((select last_seen_at > now()-interval '150 seconds' from family_internal.parenting_workers where user_id=auth.uid()),false));
$$;

-- Capability authentication replaces a browser JWT only for these two worker operations.
create function public.claim_parenting_question(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; job public.parenting_questions;
begin
  update family_internal.parenting_workers set last_seen_at=now()
    where secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex') returning user_id into u;
  if u is null then raise exception 'worker authentication required'; end if;
  update public.parenting_questions set status='failed',error='연결이 오래 끊겼어요. 새 질문으로 다시 보내 주세요.',context='',messages='[]',lease=null,completed_at=now()
    where created_by=u and ((status='queued' and created_at<now()-interval '10 minutes') or (status='processing' and started_at<now()-interval '3 minutes'));
  select q.* into job from public.parenting_questions q
    where q.created_by=u and q.status='queued'
      and exists(select 1 from public.household_members hm where hm.household_id=q.household_id and hm.user_id=u)
    order by q.created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.parenting_questions set status='processing',started_at=now(),lease=gen_random_uuid() where id=job.id returning * into job;
  return jsonb_build_object('id',job.id,'lease',job.lease,'question',job.question,'context',job.context,'messages',job.messages);
end $$;

create function public.finish_parenting_question(p_secret text,p_id uuid,p_lease uuid,p_answer text,p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  update family_internal.parenting_workers set last_seen_at=now()
    where secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex') returning user_id into u;
  if u is null then raise exception 'worker authentication required'; end if;
  if (p_error is null and (p_answer is null or length(btrim(p_answer)) not between 1 and 6000)) or length(p_error)>300 then raise exception 'invalid response'; end if;
  update public.parenting_questions set answer=case when p_error is null then p_answer else null end,
    error=p_error,status=case when p_error is null then 'completed' else 'failed' end,
    context='',messages='[]',lease=null,completed_at=now()
    where id=p_id and created_by=u and status='processing' and lease=p_lease
      and exists(select 1 from public.household_members hm where hm.household_id=parenting_questions.household_id and hm.user_id=u);
  return found;
end $$;

revoke all on function public.enqueue_parenting_question(uuid,uuid,uuid,text,text,jsonb),public.parenting_worker_status(),public.claim_parenting_question(text),public.finish_parenting_question(text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_parenting_question(uuid,uuid,uuid,text,text,jsonb),public.parenting_worker_status() to authenticated;
grant execute on function public.claim_parenting_question(text),public.finish_parenting_question(text,uuid,uuid,text,text) to anon;
