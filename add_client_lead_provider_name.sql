-- Lead provider / contact name for CRM and revenue filtering.
-- Run in Supabase SQL Editor if the column is missing.

alter table public.clients
  add column if not exists lead_provider_name text;

comment on column public.clients.lead_provider_name is
  'שם הספק / איש קשר — free text alongside lead_source.';
