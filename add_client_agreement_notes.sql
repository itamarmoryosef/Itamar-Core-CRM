-- Run in Supabase SQL Editor if the column is missing.
-- Text shown in the client agreement PDF before the signature (portal). Separate from payment_status / finance.

alter table public.clients
  add column if not exists agreement_notes text;

comment on column public.clients.agreement_notes is 'הערות להסכם — מוצג ב-PDF לפני החתימה; לא כולל פירוט תשלום (payment_status)';
