-- Fee fields as free-text (e.g. "5,000 ₪ + מע״מ", "15% מהעמלה")
-- Run in Supabase SQL Editor.

alter table public.clients
  add column if not exists fee_upfront text;

alter table public.clients
  add column if not exists fee_success text;

-- If you already created these columns as numeric, convert them to text:
-- alter table public.clients
--   alter column fee_upfront type text using fee_upfront::text;
-- alter table public.clients
--   alter column fee_success type text using fee_success::text;
