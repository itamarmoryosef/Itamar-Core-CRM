-- Run after `client_statuses` exists. Idempotent.
-- UI filters/orders active statuses; safe default true for existing rows.

alter table public.client_statuses
  add column if not exists is_active boolean not null default true;

comment on column public.client_statuses.is_active is
  'When false, hidden from new selections / some lists.';
