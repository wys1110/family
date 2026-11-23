create table public.lullaby_playback (
  user_id uuid primary key references auth.users(id) on delete cascade,
  playback_key text not null check (playback_key ~ '^[0-9a-f]{64}$'),
  ready boolean not null default false
);

alter table public.lullaby_playback enable row level security;
revoke all on public.lullaby_playback from public, anon, authenticated;
grant select (user_id, playback_key) on public.lullaby_playback to authenticated;
create policy read_own_lullaby on public.lullaby_playback
  for select to authenticated using (ready and user_id = (select auth.uid()));
