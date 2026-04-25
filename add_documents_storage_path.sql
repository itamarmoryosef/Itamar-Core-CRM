-- Run once in Supabase SQL Editor if `documents.storage_path` is missing.
-- Needed for signed view links when the uploads bucket is private.

alter table public.documents
  add column if not exists storage_path text;

comment on column public.documents.storage_path is
  'Object path inside bucket documents-uploads (e.g. clientId/uuid/file.pdf).';
