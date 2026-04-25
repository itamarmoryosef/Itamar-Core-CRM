-- Hybrid reminder mode + scheduled manual WhatsApp reminders (Supabase SQL Editor).

alter table public.clients
  add column if not exists reminder_mode text not null default 'auto';

alter table public.clients
  drop constraint if exists clients_reminder_mode_check;

alter table public.clients
  add constraint clients_reminder_mode_check
  check (reminder_mode in ('auto', 'manual'));

alter table public.clients
  add column if not exists next_custom_reminder timestamptz;

comment on column public.clients.reminder_mode is
  'auto: cron sends doc reminders every ~3 days from last_reminder_at; manual: send only when now >= next_custom_reminder, then revert to auto.';

comment on column public.clients.next_custom_reminder is
  'When reminder_mode=manual, earliest time for the next automated-style document reminder.';

create table if not exists public.client_scheduled_reminders (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  scheduled_at timestamptz not null,
  message text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now (),
  sent_at timestamptz,
  constraint client_scheduled_reminders_status_check
    check (status in ('pending', 'sent', 'cancelled', 'failed'))
);

create index if not exists client_scheduled_reminders_pending_due_idx
  on public.client_scheduled_reminders (scheduled_at)
  where status = 'pending';

create index if not exists client_scheduled_reminders_client_idx
  on public.client_scheduled_reminders (client_id);

comment on table public.client_scheduled_reminders is
  'Admin-scheduled one-off WhatsApp messages; processed by /api/cron/reminders. The cron job must use SUPABASE_SERVICE_ROLE_KEY (Vercel env) so rows and client phones are readable under RLS.';

-- Widen status check on existing DBs (idempotent if already includes failed)
alter table public.client_scheduled_reminders
  drop constraint if exists client_scheduled_reminders_status_check;

alter table public.client_scheduled_reminders
  add constraint client_scheduled_reminders_status_check
  check (status in ('pending', 'sent', 'cancelled', 'failed'));
