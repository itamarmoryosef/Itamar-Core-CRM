-- =============================================================================
-- תיקון מרוכז: lead_providers + clients (lead_source, lead_provider_name, closed_by)
-- + profiles.commission — אם הופיעו "column does not exist"
-- הרצה ב-Supabase SQL Editor (אידמפוטנטי)
-- =============================================================================

-- לקוחות
alter table public.clients
  add column if not exists lead_source text;

alter table public.clients
  add column if not exists lead_provider_name text;

-- ספקי לידים (הטבלה המלאה — כמו add_lead_providers.sql)
create table if not exists public.lead_providers (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  phone text,
  commission_percent numeric(6, 2) not null default 0,
  created_at timestamptz not null default now (),
  constraint lead_providers_name_nonempty check (length(trim(name)) > 0),
  constraint lead_providers_commission_range
    check (commission_percent >= 0 and commission_percent <= 100)
);

alter table public.lead_providers
  add column if not exists phone text;

alter table public.lead_providers
  add column if not exists commission_percent numeric(6, 2) not null default 0;

alter table public.lead_providers
  add column if not exists created_at timestamptz not null default now ();

create unique index if not exists lead_providers_name_unique
  on public.lead_providers (name);

alter table public.lead_providers enable row level security;

drop policy if exists "lead_providers_allow_all_anon" on public.lead_providers;
create policy "lead_providers_allow_all_anon"
  on public.lead_providers for all to anon using (true) with check (true);

drop policy if exists "lead_providers_allow_all_authenticated" on public.lead_providers;
create policy "lead_providers_allow_all_authenticated"
  on public.lead_providers for all to authenticated using (true) with check (true);

-- profiles קודם, אחר כך closed_by
alter table public.profiles
  add column if not exists commission_percentage numeric(6, 2) not null default 0;

alter table public.profiles
  drop constraint if exists profiles_commission_percentage_range;

alter table public.profiles
  add constraint profiles_commission_percentage_range
  check (commission_percentage >= 0 and commission_percentage <= 100);

alter table public.clients
  add column if not exists closed_by uuid references public.profiles (id) on delete set null;

create index if not exists clients_closed_by_idx on public.clients (closed_by);
