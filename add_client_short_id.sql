-- Short public ID for client portal URLs (/client/{short_id}).
-- Run in Supabase SQL Editor after backup.

alter table public.clients
  add column if not exists short_id text;

comment on column public.clients.short_id is
  '6-char public slug for /client/{short_id}; unique when set. Legacy rows backfilled by app on first admin view or manually.';

create unique index if not exists clients_short_id_unique
  on public.clients (short_id)
  where short_id is not null;
