-- Platform-wide user and family-group administration.
-- Only the account registered in public.platform_admins can execute the RPC.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from anon, authenticated;

insert into public.platform_admins (user_id, email)
select id, lower(email)
from auth.users
where lower(email) = lower('wys1110@gmail.com')
on conflict (user_id) do update set email = excluded.email;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
  )
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.get_global_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'stats', jsonb_build_object(
      'users', (select count(*) from auth.users),
      'households', (select count(*) from public.households),
      'grouped_users', (
        select count(distinct hm.user_id)
        from public.household_members hm
      ),
      'ungrouped_users', (
        select count(*)
        from auth.users u
        where not exists (
          select 1
          from public.household_members hm
          where hm.user_id = u.id
        )
      ),
      'active_30d', (
        select count(*)
        from auth.users u
        where u.last_sign_in_at >= now() - interval '30 days'
      )
    ),
    'users', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'email', u.email,
          'name', nullif(trim(coalesce(
            u.raw_user_meta_data ->> 'full_name',
            u.raw_user_meta_data ->> 'name',
            u.raw_user_meta_data ->> 'user_name',
            ''
          )), ''),
          'provider', coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
          'created_at', u.created_at,
          'last_sign_in_at', u.last_sign_in_at,
          'households', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', h.id,
                'name', h.name,
                'role', hm.role,
                'joined_at', hm.created_at
              )
              order by hm.created_at asc
            )
            from public.household_members hm
            join public.households h on h.id = hm.household_id
            where hm.user_id = u.id
          ), '[]'::jsonb)
        )
        order by u.created_at desc
      )
      from auth.users u
    ), '[]'::jsonb),
    'households', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'name', h.name,
          'owner_id', h.owner_id,
          'created_at', h.created_at,
          'member_count', (
            select count(*)
            from public.household_members hm
            where hm.household_id = h.id
          ),
          'baby_count', (
            select count(*)
            from public.babies b
            where b.household_id = h.id
              and b.archived_at is null
          ),
          'event_count', (
            select count(*)
            from public.events e
            where e.household_id = h.id
          ),
          'growth_count', (
            select count(*)
            from public.growth_entries ge
            where ge.household_id = h.id
          ),
          'members', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'user_id', hm.user_id,
                'role', hm.role,
                'joined_at', hm.created_at,
                'email', u.email,
                'name', nullif(trim(coalesce(
                  u.raw_user_meta_data ->> 'full_name',
                  u.raw_user_meta_data ->> 'name',
                  u.raw_user_meta_data ->> 'user_name',
                  ''
                )), '')
              )
              order by case when hm.role = 'owner' then 0 else 1 end, hm.created_at asc
            )
            from public.household_members hm
            join auth.users u on u.id = hm.user_id
            where hm.household_id = h.id
          ), '[]'::jsonb)
        )
        order by h.created_at desc
      )
      from public.households h
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_global_admin_overview() from public;
grant execute on function public.get_global_admin_overview() to authenticated;

comment on function public.get_global_admin_overview() is
  'Returns all app users and family group composition to the registered platform administrator.';
