begin;

create schema if not exists family_internal;
revoke all on schema family_internal from public, anon, authenticated;

-- Internal counters contain no family content; clients cannot reset their budget.
create table family_internal.action_budgets (
  scope text primary key, window_start timestamptz not null, used integer not null
);
alter table family_internal.action_budgets enable row level security;

create function family_internal.take_budget(p_scope text, p_limit integer, p_seconds integer)
returns boolean language plpgsql set search_path = pg_catalog, family_internal as $$
declare accepted integer;
begin
  insert into family_internal.action_budgets as b values (p_scope, now(), 1)
  on conflict (scope) do update set
    window_start = case when b.window_start <= now() - make_interval(secs => p_seconds) then now() else b.window_start end,
    used = case when b.window_start <= now() - make_interval(secs => p_seconds) then 1 else b.used + 1 end
  where b.used < p_limit or b.window_start <= now() - make_interval(secs => p_seconds)
  returning used into accepted;
  return accepted is not null;
end $$;

create function public.consume_family_action_budget(p_household_id uuid, p_action text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, family_internal as $$
declare quota integer; seconds integer;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception 'family access required' using errcode = '42501';
  end if;
  case p_action
    when 'ai' then quota := 20; seconds := 3600;
    when 'push' then quota := 60; seconds := 60;
    when 'push-test' then quota := 5; seconds := 60;
    else raise exception 'invalid action';
  end case;
  if not family_internal.take_budget(p_action || ':user:' || auth.uid(), quota, seconds) then return false; end if;
  if p_action = 'ai' then
    return family_internal.take_budget('ai:family:' || p_household_id, 60, 3600);
  end if;
  return true;
end $$;
revoke all on function public.consume_family_action_budget(uuid,text) from public, anon;
grant execute on function public.consume_family_action_budget(uuid,text) to authenticated;

create function public.consume_family_background_ai_budget(p_household_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, family_internal as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service access required' using errcode = '42501'; end if;
  return family_internal.take_budget('ai:family:' || p_household_id, 60, 3600);
end $$;
revoke all on function public.consume_family_background_ai_budget(uuid) from public, anon, authenticated;
grant execute on function public.consume_family_background_ai_budget(uuid) to service_role;

-- Snapshot only notification fields. The trigger commits atomically with the record.
create table family_internal.notification_changes (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  actor_id uuid not null, source_type text not null, source_id uuid not null,
  batch_id bigint not null, payload jsonb not null,
  created_at timestamptz not null default now(), claimed_at timestamptz
);
alter table family_internal.notification_changes enable row level security;
create index notification_changes_pending on family_internal.notification_changes
  (household_id, actor_id, source_type, source_id, created_at desc) where claimed_at is null;
create index notification_changes_age on family_internal.notification_changes(created_at);

create function family_internal.capture_notification_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, family_internal as $$
declare r jsonb; p jsonb; k text; source text;
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'DELETE' then r := to_jsonb(old); else r := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and to_jsonb(old) - 'updated_at' = to_jsonb(new) - 'updated_at' then return null; end if;
  if not public.is_household_member((r->>'household_id')::uuid) then return null; end if;
  k := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  source := case tg_table_name when 'events' then 'event' else 'growth' end;
  p := jsonb_build_object('kind', k, 'count', 1, 'title', r->>'title', 'occurredAt', now());
  if source = 'event' then
    p := p || jsonb_build_object('id', r->>'id', 'date', r->>'event_date',
      'endDate', r->>'event_end_date', 'time', left(r->>'event_time',5), 'member', r->>'member');
  else
    p := p || jsonb_build_object('sourceId', r->>'id', 'sourceDate', r->>'entry_date',
      'category', r->>'category', 'heightCm', r->'height_cm', 'weightKg', r->'weight_kg',
      'headCm', r->'head_cm', 'feedingMl', r->'feeding_ml', 'feedingType', r->>'feeding_type',
      'feedingSide', r->>'feeding_side', 'feedingMinutes', r->'feeding_minutes',
      'sleepMinutes', r->'sleep_minutes', 'temperatureC', r->'temperature_c', 'diaperKind', r->>'diaper_kind');
  end if;
  insert into family_internal.notification_changes(household_id, actor_id, source_type, source_id, batch_id, payload)
    values ((r->>'household_id')::uuid, auth.uid(), source, (r->>'id')::uuid, txid_current(), p);
  return null;
end $$;
create trigger events_capture_notification after insert or update or delete on public.events
  for each row execute function family_internal.capture_notification_change();
create trigger growth_capture_notification after insert or update or delete on public.growth_entries
  for each row execute function family_internal.capture_notification_change();

create function public.claim_family_notification_change(p_household_id uuid, p_source_type text, p_source_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, family_internal as $$
declare item family_internal.notification_changes; total integer;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception 'family access required' using errcode = '42501';
  end if;
  -- Serialize claims for this actor, so duplicate browser requests cannot fan out twice.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 721));
  delete from family_internal.notification_changes where created_at < now() - interval '1 day';
  select * into item from family_internal.notification_changes
    where household_id = p_household_id and actor_id = auth.uid() and source_type = p_source_type
      and (p_source_id is null or source_id = p_source_id) and claimed_at is null
      and created_at > now() - interval '10 minutes'
    order by created_at desc, id limit 1 for update;
  if item.id is null then return null; end if;
  update family_internal.notification_changes set claimed_at = now()
    where household_id = p_household_id and actor_id = auth.uid() and source_type = p_source_type
      and batch_id = item.batch_id and claimed_at is null;
  get diagnostics total = row_count;
  if total > 1 and item.payload->>'kind' = 'created' then
    item.payload := item.payload || jsonb_build_object('kind','bulk-created','count',total);
  end if;
  return item.payload;
end $$;
revoke all on function public.claim_family_notification_change(uuid,text,uuid) from public, anon;
grant execute on function public.claim_family_notification_change(uuid,text,uuid) to authenticated;

-- Keep the existing endpoint bound to its owner: ON CONFLICT must not transfer it.
create function public.register_family_push_subscription(p_household_id uuid, p_subscription jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare affected integer;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    raise exception 'family access required' using errcode = '42501';
  end if;
  if (p_subscription->>'endpoint') !~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/' then
    raise exception 'invalid push endpoint';
  end if;
  if not family_internal.take_budget('push-register:user:' || auth.uid(), 10, 60) then
    raise exception 'push registration rate limited';
  end if;
  if (select count(*) from public.push_subscriptions where user_id=auth.uid()) >= 20
    and not exists(select 1 from public.push_subscriptions where endpoint=p_subscription->>'endpoint' and user_id=auth.uid()) then
    raise exception 'push subscription limit reached';
  end if;
  insert into public.push_subscriptions as s
    (user_id,household_id,endpoint,p256dh,auth,timezone,briefing_time,enabled,briefing_enabled,updated_at,last_error)
    values (auth.uid(),p_household_id,p_subscription->>'endpoint',p_subscription->>'p256dh',
      p_subscription->>'auth',p_subscription->>'timezone',(p_subscription->>'briefing_time')::time,
      (p_subscription->>'enabled')::boolean,(p_subscription->>'briefing_enabled')::boolean,now(),null)
  on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,
    timezone=excluded.timezone,briefing_time=excluded.briefing_time,enabled=excluded.enabled,
    briefing_enabled=excluded.briefing_enabled,updated_at=now(),last_error=null
    where s.user_id=auth.uid() and s.household_id=p_household_id;
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'subscription belongs to another account' using errcode = '42501'; end if;
end $$;
revoke all on function public.register_family_push_subscription(uuid,jsonb) from public, anon, authenticated;
-- Called through a JWT-authenticated client; ownership is enforced inside the RPC.
grant execute on function public.register_family_push_subscription(uuid,jsonb) to authenticated;

create function family_internal.revoke_member_push()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.push_subscriptions set enabled=false, briefing_enabled=false, updated_at=now()
    where household_id=old.household_id and user_id=old.user_id;
  return null;
end $$;
create trigger household_member_revoke_push after delete on public.household_members
  for each row execute function family_internal.revoke_member_push();
-- Existing revoked memberships are disabled, never deleted.
update public.push_subscriptions s set enabled=false, briefing_enabled=false, updated_at=now()
  where not exists(select 1 from public.household_members m where m.household_id=s.household_id and m.user_id=s.user_id);

-- Explicit anon grants survive REVOKE FROM PUBLIC, so revoke both for app functions.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.proname = any(array[
      'confirm_baby_ai_strategy','create_household','get_global_admin_overview','get_household_invite',
      'is_household_member','is_household_owner','is_platform_admin','join_household','list_household_members',
      'list_platform_feature_requests','list_platform_recent_activity','log_app_activity',
      'remove_household_member','rotate_household_invite','schedule_baby_ai_refresh','update_platform_feature_request_status'])
  loop
    execute format('revoke execute on function %s from public, anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
revoke all on all functions in schema family_internal from public, anon, authenticated;
commit;
