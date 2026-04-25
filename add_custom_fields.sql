-- Run in Supabase SQL Editor if upgrading an existing project.

alter table public.clients
  add column if not exists custom_fields_data jsonb not null default '{}'::jsonb;

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid (),
  label text not null,
  slug text not null unique,
  field_type text not null default 'text',
  created_at timestamptz not null default now()
);

comment on table public.custom_field_definitions is
  'שדות דינמיים ללקוח; ב-Word: {{custom_<slug>}}';

alter table public.custom_field_definitions enable row level security;

drop policy if exists "custom_field_definitions_allow_all_anon" on public.custom_field_definitions;
drop policy if exists "custom_field_definitions_allow_all_authenticated" on public.custom_field_definitions;

create policy "custom_field_definitions_allow_all_anon"
  on public.custom_field_definitions
  for all
  to anon
  using (true)
  with check (true);

create policy "custom_field_definitions_allow_all_authenticated"
  on public.custom_field_definitions
  for all
  to authenticated
  using (true)
  with check (true);
