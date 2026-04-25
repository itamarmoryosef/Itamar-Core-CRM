-- Run in Supabase SQL Editor: closer tracking on clients + sales rep commission on profiles.

alter table public.profiles
  add column if not exists commission_percentage numeric(6, 2) not null default 0;

alter table public.profiles
  drop constraint if exists profiles_commission_percentage_range;

alter table public.profiles
  add constraint profiles_commission_percentage_range
  check (commission_percentage >= 0 and commission_percentage <= 100);

comment on column public.profiles.commission_percentage is
  'Sales rep commission rate (0–100) for revenue attribution when client.closed_by points to this profile.';

alter table public.clients
  add column if not exists closed_by uuid references public.profiles (id) on delete set null;

create index if not exists clients_closed_by_idx on public.clients (closed_by);

comment on column public.clients.closed_by is
  'Profile (team member) who closed the deal; used for commission on payments.';
