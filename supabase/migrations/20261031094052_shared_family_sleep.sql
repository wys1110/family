-- Shared sleep is readable by family members; mutations use one atomic RPC.
create table public.family_sleep_sessions (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  baby_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  foreign key (baby_id, household_id) references public.babies(id, household_id) on delete cascade,
  check (ended_at is null or ended_at >= started_at),
  check (ended_at is null or cancelled_at is null)
);
create unique index family_sleep_one_active_baby on public.family_sleep_sessions(baby_id)
  where ended_at is null and cancelled_at is null;
create index family_sleep_household on public.family_sleep_sessions(household_id);
alter table public.family_sleep_sessions enable row level security;
revoke all on public.family_sleep_sessions from public, anon, authenticated;
grant select on public.family_sleep_sessions to authenticated;
create policy "family can read sleep" on public.family_sleep_sessions for select to authenticated
  using (public.is_household_member(household_id));

-- Keep privileged implementation out of exposed schemas. No access to other
-- private schemas or tables is granted to callers.
create schema family_sleep_internal;
revoke all on schema family_sleep_internal from public, anon;
grant usage on schema family_sleep_internal to authenticated;
create table family_sleep_internal.start_requests (
  id uuid primary key,
  session_id uuid not null references public.family_sleep_sessions(id) on delete cascade
);
revoke all on family_sleep_internal.start_requests from public,anon,authenticated;
alter table family_sleep_internal.start_requests enable row level security;
create function family_sleep_internal.change_sleep(
  p_household_id uuid, p_baby_id uuid, p_session_id uuid, p_action text,
  p_started_at timestamptz default null, p_ended_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.family_sleep_sessions;
  entry public.growth_entries;
  stamp timestamptz := clock_timestamp();
  stop_at timestamptz;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception 'family access required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('start','stop','cancel') or p_session_id is null then
    raise exception 'invalid sleep action';
  end if;
  -- Serialize both starts and stops for this baby, including simultaneous callers.
  perform 1 from public.babies where id=p_baby_id and household_id=p_household_id
    and archived_at is null for update;
  if not found then raise exception 'active family baby required' using errcode='42501'; end if;
  stamp := clock_timestamp();
  select * into s from public.family_sleep_sessions where id=case when p_action='start' then
    coalesce((select session_id from family_sleep_internal.start_requests where id=p_session_id),p_session_id)
    else p_session_id end;
  if found and (s.household_id<>p_household_id or s.baby_id<>p_baby_id) then
    raise exception 'sleep context mismatch' using errcode='42501';
  end if;
  if p_action='start' and s.id is null then
    select * into s from public.family_sleep_sessions where baby_id=p_baby_id
      and ended_at is null and cancelled_at is null;
    if s.id is null then
      if p_started_at is not null and (not isfinite(p_started_at) or p_started_at > stamp + interval '1 minute'
        or p_started_at < stamp - interval '24 hours') then raise exception 'invalid sleep start'; end if;
      insert into public.family_sleep_sessions(id,household_id,baby_id,started_at,created_by)
      values(p_session_id,p_household_id,p_baby_id,least(coalesce(p_started_at,stamp),stamp),auth.uid()) returning * into s;
    end if;
  elsif p_action in ('stop','cancel') then
    if s.id is null then raise exception 'sleep session missing'; end if;
    if s.ended_at is null and s.cancelled_at is null then
      if p_action='cancel' then
        update public.family_sleep_sessions set cancelled_at=stamp where id=s.id returning * into s;
      else
        stop_at := least(coalesce(p_ended_at,stamp),stamp);
        if not isfinite(stop_at) or stop_at < s.started_at or stop_at > s.started_at + interval '24 hours' then
          raise exception 'sleep duration must be within 24 hours';
        end if;
        -- Same session ID is the record ID. End state and record commit together.
        insert into public.growth_entries(id,household_id,baby_id,title,entry_date,entry_time,category,sleep_minutes,note,created_by)
        values(s.id,s.household_id,s.baby_id,'수면 기록',(s.started_at at time zone 'Asia/Seoul')::date,
          (s.started_at at time zone 'Asia/Seoul')::time,'수면',
          greatest(1,round(extract(epoch from (stop_at-s.started_at))/60)::integer),'타이머로 자동 기록',auth.uid());
        update public.family_sleep_sessions set ended_at=stop_at where id=s.id returning * into s;
      end if;
    end if;
  end if;
  if p_action='start' then
    insert into family_sleep_internal.start_requests(id,session_id) values(p_session_id,s.id) on conflict(id) do nothing;
  end if;
  -- Retries never recreate a record that a family member has since deleted.
  if s.ended_at is not null then select * into entry from public.growth_entries where id=s.id and household_id=p_household_id; end if;
  return jsonb_build_object('session',to_jsonb(s),'entry',case when entry.id is null then null else to_jsonb(entry) end);
end $$;
revoke all on function family_sleep_internal.change_sleep(uuid,uuid,uuid,text,timestamptz,timestamptz) from public,anon;
grant execute on function family_sleep_internal.change_sleep(uuid,uuid,uuid,text,timestamptz,timestamptz) to authenticated;

create function public.change_family_sleep(
  p_household_id uuid, p_baby_id uuid, p_session_id uuid, p_action text,
  p_started_at timestamptz default null, p_ended_at timestamptz default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select family_sleep_internal.change_sleep(p_household_id,p_baby_id,p_session_id,p_action,p_started_at,p_ended_at);
$$;
revoke all on function public.change_family_sleep(uuid,uuid,uuid,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.change_family_sleep(uuid,uuid,uuid,text,timestamptz,timestamptz) to authenticated;

alter publication supabase_realtime add table public.family_sleep_sessions;
