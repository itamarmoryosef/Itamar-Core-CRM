-- Prerequisites: `public.clients` must already exist (run `database.sql` / migrations first).
-- This file only adds `created_at`. It does NOT fix:
--   "Could not find the table 'public.clients' in the schema cache"
-- For that: ensure you're on the correct Supabase project, create the table, then reload PostgREST cache:
--   NOTIFY pgrst, 'reload schema';
--
-- Supabase SQL Editor: מיון לקוחות לפי תאריך יצירה בלוח הבקרה.
alter table public.clients
  add column if not exists created_at timestamptz not null default now();

comment on column public.clients.created_at is
  'זמן יצירת רשומת הלקוח (למיון ברשימת האדמין).';
