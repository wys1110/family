alter table public.calendar_members
  add column if not exists archived_at timestamptz;

create index if not exists calendar_members_household_active_idx
  on public.calendar_members(household_id, archived_at, sort_order);
