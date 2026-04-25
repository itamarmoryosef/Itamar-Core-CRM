-- Per-client master switch for cron-driven WhatsApp reminders (Supabase SQL Editor).

alter table public.clients
  add column if not exists reminders_enabled boolean not null default true;

comment on column public.clients.reminders_enabled is
  'When false, /api/cron/reminders skips automatic document pings, manual due-date pings, and pending client_scheduled_reminders for this client.';
