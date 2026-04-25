-- Per-client template choice for portal DOCX agreement step (single or sequential multi-template).
-- Run in Supabase SQL Editor after deployment if these columns are missing.

alter table public.clients
  add column if not exists agreement_template_ids uuid[] not null default '{}';

alter table public.clients
  add column if not exists agreement_template_sign_index integer not null default 0;

comment on column public.clients.agreement_template_ids is
  'Ordered template UUIDs from public.templates; empty = legacy "latest active template".';

comment on column public.clients.agreement_template_sign_index is
  '0-based index into agreement_template_ids for the next template signature step.';
