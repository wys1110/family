alter table public.notifications
  drop constraint if exists notifications_kind_check,
  drop constraint if exists notifications_source_type_check;

alter table public.notifications
  add constraint notifications_kind_check
    check (kind in ('event_change', 'growth_change', 'daily_briefing', 'system')),
  add constraint notifications_source_type_check
    check (source_type is null or source_type in ('event', 'todo', 'briefing', 'growth', 'system'));
