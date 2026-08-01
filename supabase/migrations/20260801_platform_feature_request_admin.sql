-- 플랫폼 전체 기능 요청은 아래 계정만 조회·상태 변경할 수 있습니다.
-- 초기 관리자: wys1110@gmail.com
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

create or replace function public.list_platform_feature_requests(
  status_filter text default null,
  search_text text default null,
  row_limit integer default 200
)
returns table (
  id uuid,
  household_id uuid,
  household_name text,
  content text,
  status text,
  requester_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  return query
  select
    request.id,
    request.household_id,
    coalesce(household.name, '삭제된 가족 그룹')::text,
    request.content,
    request.status,
    request.requester_name,
    request.created_at,
    request.updated_at
  from public.feature_requests as request
  left join public.households as household on household.id = request.household_id
  where
    (status_filter is null or status_filter = 'all' or request.status = status_filter)
    and (
      search_text is null
      or btrim(search_text) = ''
      or request.content ilike '%' || btrim(search_text) || '%'
      or coalesce(request.requester_name, '') ilike '%' || btrim(search_text) || '%'
      or coalesce(household.name, '') ilike '%' || btrim(search_text) || '%'
    )
  order by request.created_at desc
  limit least(greatest(coalesce(row_limit, 200), 1), 500);
end;
$$;

revoke all on function public.list_platform_feature_requests(text, text, integer) from public;
grant execute on function public.list_platform_feature_requests(text, text, integer) to authenticated;

create or replace function public.update_platform_feature_request_status(
  request_id uuid,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  if next_status not in ('new', 'reviewing', 'planned', 'done', 'dismissed') then
    raise exception 'invalid feature request status' using errcode = '22023';
  end if;

  update public.feature_requests
  set status = next_status, updated_at = now()
  where id = request_id;

  if not found then
    raise exception 'feature request not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_platform_feature_request_status(uuid, text) from public;
grant execute on function public.update_platform_feature_request_status(uuid, text) to authenticated;
