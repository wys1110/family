-- Existing clients include the current user in upserts, even when editing a family member's record.
create function public.preserve_family_record_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.household_id is distinct from old.household_id then
    raise exception 'family record household cannot change' using errcode = '42501';
  end if;
  new.created_by := old.created_by;
  return new;
end $$;
revoke all on function public.preserve_family_record_identity() from public, anon, authenticated;

create trigger records_preserve_identity before update on public.events
  for each row execute function public.preserve_family_record_identity();
create trigger records_preserve_identity before update on public.babies
  for each row execute function public.preserve_family_record_identity();
create trigger records_preserve_identity before update on public.growth_entries
  for each row execute function public.preserve_family_record_identity();
create trigger records_preserve_identity before update on public.family_todos
  for each row execute function public.preserve_family_record_identity();
