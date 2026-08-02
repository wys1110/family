create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'system' check (kind in ('event_change', 'daily_briefing', 'system')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 500),
  icon text not null default '🔔' check (char_length(icon) between 1 and 16),
  source_type text check (source_type is null or source_type in ('event', 'todo', 'briefing', 'system')),
  source_id text check (source_id is null or char_length(source_id) <= 120),
  source_date date,
  scheduled_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  delivered_at timestamptz,
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, household_id, dedupe_key)
);

create index if not exists notifications_user_feed_idx
  on public.notifications(user_id, household_id, dismissed_at, scheduled_at desc);
create index if not exists notifications_unread_idx
  on public.notifications(user_id, household_id, scheduled_at desc)
  where read_at is null and dismissed_at is null;
create index if not exists notifications_source_idx
  on public.notifications(household_id, source_type, source_id);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = notifications.household_id
        and hm.user_id = auth.uid()
    )
  );

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = notifications.household_id
        and hm.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = notifications.household_id
        and hm.user_id = auth.uid()
    )
  );

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = notifications.household_id
        and hm.user_id = auth.uid()
    )
  );

revoke insert on public.notifications from anon, authenticated;
grant select, update, delete on public.notifications to authenticated;

comment on table public.notifications is
  'Per-user persistent notification inbox for family schedule changes and daily briefings.';
comment on column public.notifications.dedupe_key is
  'Stable per-user key used by service-role writers to avoid duplicate inbox rows.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;
