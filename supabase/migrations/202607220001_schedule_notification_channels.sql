alter table public.push_subscriptions
  add column if not exists briefing_enabled boolean not null default true;

create index if not exists push_subscriptions_briefing_dispatch_idx
  on public.push_subscriptions(enabled, briefing_enabled, briefing_time, last_sent_on);

comment on column public.push_subscriptions.briefing_enabled is
  'Controls the daily briefing independently from immediate family event notifications.';
