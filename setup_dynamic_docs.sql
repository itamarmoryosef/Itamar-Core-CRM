-- Dynamic document types (managed from Admin). Run once in Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.document_types (
  id uuid primary key default gen_random_uuid (),
  name text not null unique,
  download_link text,
  blank_form_original_filename text,
  created_at timestamptz not null default now()
);

alter table public.document_types
  add column if not exists blank_form_original_filename text;

alter table public.document_types enable row level security;

drop policy if exists "document_types_allow_all_anon" on public.document_types;
drop policy if exists "document_types_allow_all_authenticated" on public.document_types;

create policy "document_types_allow_all_anon"
  on public.document_types
  for all
  to anon
  using (true)
  with check (true);

create policy "document_types_allow_all_authenticated"
  on public.document_types
  for all
  to authenticated
  using (true)
  with check (true);

insert into public.document_types (name, download_link)
values
  ('צילום תעודת זהות וספח', null),
  (
    'הצהרת בריאות',
    'https://www.gov.il/BlobFolder/service/firearm-license-health-declaration/he/firearm-license-health-declaration.pdf'
  ),
  ('אישור שירות צבאי/לאומי', null),
  ('תלושי שכר / אישור רואה חשבון', null)
on conflict (name) do update
set
  download_link = excluded.download_link;

-- טפסים ריקים לסוגי מסמכים (ממשק ניהול) נשמרים ב-Storage באקט׳ בשם templates.
-- ב-Supabase: Storage → New bucket → שם: templates → Public (לקבלת getPublicUrl).
-- יש להגדיר מדיניות RLS על storage.objects לאפשר INSERT (ועיון) למפתח ה-anon בשימוש באפליקציה.
