alter table public.events
  add column if not exists event_end_date date;

update public.events
set event_end_date = event_date
where event_end_date is null;

alter table public.events
  alter column event_end_date set not null;

alter table public.events
  drop constraint if exists events_date_range_check;

alter table public.events
  add constraint events_date_range_check
  check (event_end_date >= event_date);

create index if not exists events_household_date_range_idx
  on public.events(household_id, event_date, event_end_date);
