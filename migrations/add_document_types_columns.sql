-- תיקון: "column document_types.download_link does not exist" (ואופציונלית blank_form)
-- הרצה ב-Supabase SQL Editor
alter table public.document_types
  add column if not exists download_link text;

alter table public.document_types
  add column if not exists blank_form_original_filename text;
