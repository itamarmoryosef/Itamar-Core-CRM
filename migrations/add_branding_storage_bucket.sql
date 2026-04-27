-- Public logo uploads for /admin settings → stored URL in settings.branding_logo_url
-- Idempotent. Run in Supabase SQL (Storage uses storage.buckets + storage.objects policies)

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "branding_anon_all" on storage.objects;
drop policy if exists "branding_authenticated_all" on storage.objects;

create policy "branding_anon_all"
  on storage.objects
  for all
  to anon
  using (bucket_id = 'branding')
  with check (bucket_id = 'branding');

create policy "branding_authenticated_all"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'branding')
  with check (bucket_id = 'branding');
