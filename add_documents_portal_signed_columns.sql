-- Optional metadata for portal-signed PDF rows (run in Supabase SQL Editor).
-- Lets the admin UI show a clear label and filter by document_type.

alter table public.documents
  add column if not exists name text;

alter table public.documents
  add column if not exists document_type text;

alter table public.documents
  add column if not exists is_active boolean not null default true;

comment on column public.documents.name is
  'Display label for the row (e.g. Hebrew title with timestamp).';

comment on column public.documents.document_type is
  'Category, e.g. Signed Agreement for portal-generated signed PDFs.';

comment on column public.documents.is_active is
  'Soft visibility; portal inserts set true.';
