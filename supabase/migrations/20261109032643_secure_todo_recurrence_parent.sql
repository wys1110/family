begin;

-- Do not silently delete or rewrite existing records if an invalid link exists.
lock table public.family_todos in share row exclusive mode;
do $$
begin
  if exists (
    select 1 from public.family_todos child
    join public.family_todos parent on parent.id = child.recurrence_parent_id
    where child.household_id <> parent.household_id
  ) then
    raise exception 'cross-household todo recurrence links require review before migration'
      using errcode = '23514';
  end if;
end $$;

-- Foreign-key and unique checks bypass RLS. Authorize the parent before either
-- can accept a hidden UUID or reserve that parent's only successor.
create or replace function public.check_family_todo_recurrence_parent()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.recurrence_parent_id is null then return new; end if;
  if tg_op = 'UPDATE' then
    -- A parent may later become private. Existing children remain editable;
    -- only creating or changing a relationship requires parent access again.
    if new.recurrence_parent_id is not distinct from old.recurrence_parent_id
      and new.household_id is not distinct from old.household_id then
      return new;
    end if;
  end if;
  perform 1 from public.family_todos parent
    where parent.id = new.recurrence_parent_id
      and parent.id <> new.id
      and parent.household_id = new.household_id
      and public.is_household_member(parent.household_id)
      and (parent.visibility = 'family' or parent.created_by = auth.uid());
  if not found then
    -- A missing parent and an inaccessible parent deliberately look identical.
    raise exception 'accessible same-household todo parent required' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.check_family_todo_recurrence_parent() from public, anon, authenticated;

create trigger family_todos_check_recurrence_parent
  before insert or update of recurrence_parent_id, household_id on public.family_todos
  for each row execute function public.check_family_todo_recurrence_parent();

commit;
