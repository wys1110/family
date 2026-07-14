alter table public.growth_entries drop constraint if exists growth_entries_category_check;
update public.growth_entries set category = '건강·병원' where category = '건강';

alter table public.growth_entries
  add column if not exists entry_time time,
  add column if not exists head_cm numeric(4,1) check (head_cm > 0 and head_cm <= 100),
  add column if not exists feeding_ml integer check (feeding_ml > 0 and feeding_ml <= 3000),
  add column if not exists sleep_minutes integer check (sleep_minutes > 0 and sleep_minutes <= 1440),
  add column if not exists temperature_c numeric(3,1) check (temperature_c between 30 and 45),
  add column if not exists diaper_kind text check (diaper_kind in ('소변', '대변', '소변·대변')),
  add column if not exists photo_paths text[] not null default '{}';

alter table public.growth_entries
  add constraint growth_entries_category_check
  check (category in ('첫 순간', '성장', '수유·이유식', '수면', '기저귀', '건강·병원', '놀이', '기타'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('growth-photos', 'growth-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "family can view growth photos" on storage.objects;
drop policy if exists "family can upload growth photos" on storage.objects;
drop policy if exists "family can update growth photos" on storage.objects;
drop policy if exists "family can delete growth photos" on storage.objects;

create policy "family can view growth photos" on storage.objects for select to authenticated
using (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy "family can upload growth photos" on storage.objects for insert to authenticated
with check (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy "family can update growth photos" on storage.objects for update to authenticated
using (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid))
with check (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy "family can delete growth photos" on storage.objects for delete to authenticated
using (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));
