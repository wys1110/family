alter table public.family_todos
  add column if not exists visibility text not null default 'family'
  check (visibility in ('family', 'private'));

create index if not exists family_todos_household_visibility_creator_idx
  on public.family_todos(household_id, visibility, created_by, completed, due_date, created_at desc);

create or replace function public.prevent_family_todo_creator_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'family todo creator cannot change';
  end if;
  return new;
end;
$$;

drop trigger if exists family_todos_prevent_creator_change on public.family_todos;
create trigger family_todos_prevent_creator_change
  before update on public.family_todos
  for each row execute function public.prevent_family_todo_creator_change();

drop policy if exists "members can view family todos" on public.family_todos;
drop policy if exists "members can create family todos" on public.family_todos;
drop policy if exists "members can update family todos" on public.family_todos;
drop policy if exists "members can delete family todos" on public.family_todos;

create policy "members can view scoped family todos" on public.family_todos
  for select to authenticated
  using (
    (select public.is_household_member(household_id))
    and (visibility = 'family' or created_by = (select auth.uid()))
  );

create policy "members can create scoped family todos" on public.family_todos
  for insert to authenticated
  with check (
    (select public.is_household_member(household_id))
    and created_by = (select auth.uid())
  );

create policy "members can update scoped family todos" on public.family_todos
  for update to authenticated
  using (
    (select public.is_household_member(household_id))
    and (visibility = 'family' or created_by = (select auth.uid()))
  )
  with check (
    (select public.is_household_member(household_id))
    and (visibility = 'family' or created_by = (select auth.uid()))
  );

create policy "members can delete scoped family todos" on public.family_todos
  for delete to authenticated
  using (
    (select public.is_household_member(household_id))
    and (visibility = 'family' or created_by = (select auth.uid()))
  );
