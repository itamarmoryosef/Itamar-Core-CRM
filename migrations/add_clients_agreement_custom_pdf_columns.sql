-- הסכם PDF ייעודי ללקוח (פורטל / חתימה). הרצה ב-Supabase SQL Editor אם חסרות העמודות.
-- מלא יותר: client_agreement_request.sql או supabase/PASTE_03_ADDONS.sql

alter table public.clients
  add column if not exists agreement_custom_pdf_path text;

alter table public.clients
  add column if not exists agreement_custom_pdf_filename text;
