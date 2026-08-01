-- Platform administrator Supabase resource usage summary.
-- Reads database bytes and Storage object metadata without exposing service-role credentials.

create or replace function public.get_platform_resource_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  database_bytes bigint := 0;
  storage_bytes bigint := 0;
  storage_object_count bigint := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  select coalesce(sum(pg_database_size(datname)), 0)
  into database_bytes
  from pg_database;

  if to_regclass('storage.objects') is not null then
    execute $query$
      select
        coalesce(sum(
          case
            when metadata ->> 'size' ~ '^[0-9]+$' then (metadata ->> 'size')::bigint
            else 0
          end
        ), 0),
        count(*)
      from storage.objects
    $query$
    into storage_bytes, storage_object_count;
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'database_bytes', database_bytes,
    'storage_bytes', storage_bytes,
    'storage_object_count', storage_object_count
  );
end;
$$;

revoke all on function public.get_platform_resource_usage() from public;
grant execute on function public.get_platform_resource_usage() to authenticated;

comment on function public.get_platform_resource_usage() is
  'Returns database and file Storage usage to a registered platform administrator.';
