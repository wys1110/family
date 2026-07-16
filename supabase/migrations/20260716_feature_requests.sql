create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'done', 'dismissed')),
  requester_name text check (requester_name is null or char_length(requester_name) <= 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feature_requests_household_created_idx
  on public.feature_requests(household_id, created_at desc);

alter table public.feature_requests enable row level security;

create or replace function public.is_household_owner(target_household uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.households
    where id = target_household and owner_id = auth.uid()
  )
$$;

revoke all on function public.is_household_owner(uuid) from public;
grant execute on function public.is_household_owner(uuid) to authenticated;

drop policy if exists "members can submit feature requests" on public.feature_requests;
create policy "members can submit feature requests"
on public.feature_requests for insert to authenticated
with check (
  public.is_household_member(household_id)
  and created_by = auth.uid()
  and status = 'new'
);

drop policy if exists "owner can view feature requests" on public.feature_requests;
create policy "owner can view feature requests"
on public.feature_requests for select to authenticated
using (public.is_household_owner(household_id));

drop policy if exists "owner can update feature requests" on public.feature_requests;
create policy "owner can update feature requests"
on public.feature_requests for update to authenticated
using (public.is_household_owner(household_id))
with check (public.is_household_owner(household_id));
