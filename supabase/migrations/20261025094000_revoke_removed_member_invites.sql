begin;
-- Serialize invitation admission with membership removal and token rotation.
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
    and invite_code_expires_at > now()
  for update;

  if target_id is null then
    return null;
  end if;

  insert into household_members(household_id, user_id)
  values (target_id, auth.uid());

  delete from household_join_attempts
  where user_id = auth.uid();

  return target_id;
end $function$;

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
  where owner_id = auth.uid()
  for update;

  if target_household is null
    or target_user = auth.uid()
  then
    return false;
  end if;

  delete from household_members
  where household_id = target_household
    and user_id = target_user
    and role <> 'owner';

  if not found then
    return false;
  end if;

  -- Former members retain old links; revoke them in the same transaction.
  update households
  set invite_code = upper(encode(gen_random_bytes(16), 'hex')),
      invite_code_expires_at = now() + interval '7 days'
  where id = target_household;
  return true;
end $function$;

revoke execute on function public.join_household(text), public.remove_household_member(uuid) from public, anon;
grant execute on function public.join_household(text), public.remove_household_member(uuid) to authenticated;
commit;
