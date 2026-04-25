-- הרצה ב-Supabase SQL Editor: בקשת חתימה לפי לקוח (תבנית פעילה או PDF ייעודי).

alter table public.clients
  add column if not exists agreement_request_active boolean not null default true;

alter table public.clients
  add column if not exists agreement_source text;

alter table public.clients
  drop constraint if exists clients_agreement_source_check;

alter table public.clients
  add constraint clients_agreement_source_check
  check (
    agreement_source is null
    or agreement_source in ('template', 'custom_pdf', 'from_document')
  );

alter table public.clients
  add column if not exists agreement_document_id uuid references public.documents (id) on delete set null;

alter table public.clients
  add column if not exists agreement_custom_pdf_path text;

alter table public.clients
  add column if not exists agreement_custom_pdf_filename text;

comment on column public.clients.agreement_request_active is
  'כבוי = אין בקשת חתימה בפורטל עד שהמנהל מפעיל. דולחים קיימים נשארים true (ברירת מחדל בעמודה).';

comment on column public.clients.agreement_source is
  'template = תבנית docx הפעילה הגלובלית; custom_pdf = קובץ PDF ייעודי ב-Storage. null + active = התנהגות ישנה (תבנית גלובלית).';

insert into storage.buckets (id, name, public)
values ('client-agreements', 'client-agreements', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "client_agreements_anon_all" on storage.objects;
drop policy if exists "client_agreements_authenticated_all" on storage.objects;

create policy "client_agreements_anon_all"
  on storage.objects
  for all
  to anon
  using (bucket_id = 'client-agreements')
  with check (bucket_id = 'client-agreements');

create policy "client_agreements_authenticated_all"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'client-agreements')
  with check (bucket_id = 'client-agreements');
