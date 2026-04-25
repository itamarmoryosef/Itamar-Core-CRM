-- הרצה ב-Supabase SQL Editor: טבלת ספקי לידים לניהול בהגדרות, קישור ללקוחות ועמלות בדשבורד הכנסות.

create table if not exists public.lead_providers (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  phone text,
  commission_percent numeric(6, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint lead_providers_name_nonempty check (length(trim(name)) > 0),
  constraint lead_providers_commission_range
    check (commission_percent >= 0 and commission_percent <= 100)
);

create unique index if not exists lead_providers_name_unique
  on public.lead_providers (name);

comment on table public.lead_providers is
  'ספקי לידים — שם (נשמר ב־clients.lead_provider_name), טלפון, אחוז עמלה.';

alter table public.lead_providers enable row level security;

drop policy if exists "lead_providers_allow_all_anon" on public.lead_providers;
create policy "lead_providers_allow_all_anon"
  on public.lead_providers
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "lead_providers_allow_all_authenticated" on public.lead_providers;
create policy "lead_providers_allow_all_authenticated"
  on public.lead_providers
  for all
  to authenticated
  using (true)
  with check (true);
