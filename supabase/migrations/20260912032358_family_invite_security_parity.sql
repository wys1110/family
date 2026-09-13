begin;
-- Capture previously unversioned production invite/member RPCs.
alter table public.households add column if not exists invite_code_expires_at timestamptz not null default (now() + interval '7 days');
alter table public.households alter column invite_code set default upper(encode(gen_random_bytes(16),'hex'));
alter table public.households drop constraint if exists households_invite_code_format;
alter table public.households add constraint households_invite_code_format check (invite_code ~ '^([0-9A-F]{6}|[0-9A-F]{32})$');
update public.households set invite_code_expires_at = now() where length(invite_code) = 6 and invite_code_expires_at > now();
create table if not exists public.household_join_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.household_join_attempts enable row level security;
revoke all on public.household_join_attempts from public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_household_invite()
 RETURNS TABLE(invite_code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_id uuid;
begin
  select id into target_id
  from households
  where owner_id = auth.uid();

  if target_id is null then
    raise exception 'owner access required';
  end if;

  if exists(
    select 1
    from households
    where id = target_id
      and invite_code_expires_at <= now()
  ) then
    update households
    set
      invite_code = upper(encode(gen_random_bytes(16), 'hex')),
      invite_code_expires_at = now() + interval '7 days'
    where id = target_id;
  end if;

  return query
    select h.invite_code, h.invite_code_expires_at
    from households h
    where h.id = target_id;
end $function$;

CREATE OR REPLACE FUNCTION public.join_household(code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_id uuid;
  attempts integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if exists(
    select 1
    from household_members
    where user_id = auth.uid()
  ) then
    raise exception 'already in a household';
  end if;

  insert into household_join_attempts(
    user_id,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (auth.uid(), now(), 1, now())
  on conflict (user_id) do update set
    window_started_at = case
      when household_join_attempts.window_started_at
        < now() - interval '15 minutes'
      then now()
      else household_join_attempts.window_started_at
    end,
    attempt_count = case
      when household_join_attempts.window_started_at
        < now() - interval '15 minutes'
      then 1
      else household_join_attempts.attempt_count + 1
    end,
    updated_at = now()
  returning attempt_count into attempts;

  if attempts > 5 then
    return null;
  end if;

  select id into target_id
  from households
  where invite_code = upper(trim(code))
    and invite_code_expires_at > now();

  if target_id is null then
    return null;
  end if;

  insert into household_members(household_id, user_id)
  values (target_id, auth.uid());

  delete from household_join_attempts
  where user_id = auth.uid();

  return target_id;
end $function$;

CREATE OR REPLACE FUNCTION public.list_household_members()
 RETURNS TABLE(user_id uuid, role text, display_name text, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select
    hm.user_id,
    hm.role,
    coalesce(
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      split_part(u.email, '@', 1),
      '가족 구성원'
    ),
    u.email::text
  from household_members hm
  join households h
    on h.id = hm.household_id
  join auth.users u
    on u.id = hm.user_id
  where h.owner_id = auth.uid()
  order by
    case when hm.role = 'owner' then 0 else 1 end,
    hm.created_at;
$function$;

CREATE OR REPLACE FUNCTION public.remove_household_member(target_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_household uuid;
begin
  select id into target_household
  from households
  where owner_id = auth.uid();

  if target_household is null
    or target_user = auth.uid()
  then
    return false;
  end if;

  delete from household_members
  where household_id = target_household
    and user_id = target_user
    and role <> 'owner';

  return found;
end $function$;

CREATE OR REPLACE FUNCTION public.rotate_household_invite()
 RETURNS TABLE(invite_code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_id uuid;
begin
  select id into target_id
  from households
  where owner_id = auth.uid();

  if target_id is null then
    raise exception 'owner access required';
  end if;

  update households
  set
    invite_code = upper(encode(gen_random_bytes(16), 'hex')),
    invite_code_expires_at = now() + interval '7 days'
  where id = target_id;

  return query
    select h.invite_code, h.invite_code_expires_at
    from households h
    where h.id = target_id;
end $function$;
revoke execute on function public.join_household(text), public.get_household_invite(), public.rotate_household_invite(), public.remove_household_member(uuid), public.list_household_members() from public, anon;
grant execute on function public.join_household(text), public.get_household_invite(), public.rotate_household_invite(), public.remove_household_member(uuid), public.list_household_members() to authenticated;
commit;
