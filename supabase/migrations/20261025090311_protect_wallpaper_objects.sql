-- Wallpaper metadata is owner-managed; its files must use the same write boundary.
alter policy "family can upload growth photos" on storage.objects
with check (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid)
  and ((storage.foldername(name))[2] is distinct from 'wallpapers' or public.is_household_owner(((storage.foldername(name))[1])::uuid)));

alter policy "family can update growth photos" on storage.objects
using (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid)
  and ((storage.foldername(name))[2] is distinct from 'wallpapers' or public.is_household_owner(((storage.foldername(name))[1])::uuid)))
with check (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid)
  and ((storage.foldername(name))[2] is distinct from 'wallpapers' or public.is_household_owner(((storage.foldername(name))[1])::uuid)));

alter policy "family can delete growth photos" on storage.objects
using (bucket_id = 'growth-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid)
  and ((storage.foldername(name))[2] is distinct from 'wallpapers' or public.is_household_owner(((storage.foldername(name))[1])::uuid)));
