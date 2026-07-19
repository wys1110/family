create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 4096),
  p256dh text not null check (char_length(p256dh) between 20 and 512),
  auth text not null check (char_length(auth) between 8 and 256),
  timezone text not null default 'Asia/Seoul' check (char_length(timezone) between 1 and 80),
  briefing_time time not null default '09:00',
  enabled boolean not null default true,
  last_sent_on date,
  last_sent_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_dispatch_idx
  on public.push_subscriptions(enabled, briefing_time, last_sent_on);
create index if not exists push_subscriptions_user_household_idx
  on public.push_subscriptions(user_id, household_id);

alter table public.push_subscriptions enable row level security;

comment on table public.push_subscriptions is
  'Service-role-only Web Push subscriptions for daily family schedule briefings.';
comment on column public.push_subscriptions.briefing_time is
  'Local wall-clock time interpreted in the subscription timezone.';
