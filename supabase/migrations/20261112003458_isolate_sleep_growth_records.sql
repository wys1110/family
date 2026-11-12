-- Separate timer identity from editable growth-record identity. Existing data is retained.
-- A deleted record clears its linkage so a later reuse of its UUID cannot revive it.
alter table public.family_sleep_sessions add column growth_entry_id uuid
  references public.growth_entries(id) on delete set null;
create index family_sleep_growth_entry on public.family_sleep_sessions(growth_entry_id)
  where growth_entry_id is not null;
update public.family_sleep_sessions s set growth_entry_id=e.id
  from public.growth_entries e
  where s.ended_at is not null and e.id=s.id
    and e.household_id=s.household_id and e.baby_id=s.baby_id;

create or replace function family_sleep_internal.change_sleep(
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
    else p_session_id end
    and (p_action='start' or (household_id=p_household_id and baby_id=p_baby_id));
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
        -- The record ID is server-generated, independent of the known session ID.
        -- End state, linkage and record commit together under the baby lock.
        insert into public.growth_entries(id,household_id,baby_id,title,entry_date,entry_time,category,sleep_minutes,note,created_by)
        values(gen_random_uuid(),s.household_id,s.baby_id,'수면 기록',(s.started_at at time zone 'Asia/Seoul')::date,
          (s.started_at at time zone 'Asia/Seoul')::time,'수면',
          greatest(1,round(extract(epoch from (stop_at-s.started_at))/60)::integer),'타이머로 자동 기록',auth.uid()) returning * into entry;
        update public.family_sleep_sessions set ended_at=stop_at,growth_entry_id=entry.id where id=s.id returning * into s;
      end if;
    end if;
  end if;
  if p_action='start' then
    insert into family_sleep_internal.start_requests(id,session_id) values(p_session_id,s.id) on conflict(id) do nothing;
  end if;
  -- Retries never recreate a record that a family member has since deleted.
  if s.ended_at is not null then select e.* into entry from public.family_sleep_sessions linked
    join public.growth_entries e on e.id=linked.growth_entry_id
    where linked.id=s.id and linked.household_id=p_household_id and linked.baby_id=p_baby_id
      and e.household_id=p_household_id and e.baby_id=p_baby_id; end if;
  return jsonb_build_object('session',to_jsonb(s),'entry',case when entry.id is null then null else to_jsonb(entry) end);
end $$;
