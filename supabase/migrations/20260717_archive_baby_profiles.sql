alter table public.babies
  add column if not exists archived_at timestamptz;

create index if not exists babies_active_household_birth_idx
  on public.babies(household_id, birth_date)
  where archived_at is null;

comment on column public.babies.archived_at is
  'Soft-delete timestamp. Archived profiles keep all linked growth entries and photos.';
