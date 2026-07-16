create table if not exists public.family_todos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  due_date date,
  assignee text not null default '가족' check (char_length(assignee) between 1 and 20),
  note text check (note is null or char_length(note) <= 500),
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  completed boolean not null default false,
  completed_at timestamptz,
  recurrence_parent_id uuid references public.family_todos(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((completed = false and completed_at is null) or completed = true)
);

create index if not exists family_todos_household_due_idx
  on public.family_todos(household_id, completed, due_date, created_at desc);

create unique index if not exists family_todos_recurrence_parent_unique_idx
  on public.family_todos(recurrence_parent_id)
  where recurrence_parent_id is not null;

alter table public.family_todos enable row level security;

drop policy if exists "members can view family todos" on public.family_todos;
create policy "members can view family todos"
on public.family_todos for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "members can create family todos" on public.family_todos;
create policy "members can create family todos"
on public.family_todos for insert to authenticated
with check (
  public.is_household_member(household_id)
  and created_by = auth.uid()
);

drop policy if exists "members can update family todos" on public.family_todos;
create policy "members can update family todos"
on public.family_todos for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "members can delete family todos" on public.family_todos;
create policy "members can delete family todos"
on public.family_todos for delete to authenticated
using (public.is_household_member(household_id));
