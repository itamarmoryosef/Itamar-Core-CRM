-- Agreement form templates: structured grid of CRM custom fields for portal + PDF.
-- Run in Supabase SQL Editor. Requires public.custom_field_definitions.

create table if not exists public.agreement_templates (
  id uuid primary key default gen_random_uuid (),
  title text not null,
  description text,
  created_at timestamptz not null default now ()
);

create table if not exists public.template_fields (
  id uuid primary key default gen_random_uuid (),
  template_id uuid not null references public.agreement_templates (id) on delete cascade,
  definition_id uuid not null references public.custom_field_definitions (id) on delete cascade,
  row_number int not null default 1,
  col_span int not null default 4,
  sort_order int not null default 0,
  constraint template_fields_col_span_check check (
    col_span >= 1
    and col_span <= 4
  ),
  constraint template_fields_template_definition_unique unique (template_id, definition_id)
);

create index if not exists template_fields_template_id_idx on public.template_fields (template_id);

alter table public.clients
  add column if not exists agreement_structure_template_id uuid references public.agreement_templates (id) on delete set null;

alter table public.agreement_templates enable row level security;
alter table public.template_fields enable row level security;

drop policy if exists "agreement_templates_allow_all_anon" on public.agreement_templates;
drop policy if exists "agreement_templates_allow_all_authenticated" on public.agreement_templates;
drop policy if exists "template_fields_allow_all_anon" on public.template_fields;
drop policy if exists "template_fields_allow_all_authenticated" on public.template_fields;

create policy "agreement_templates_allow_all_anon"
  on public.agreement_templates
  for all
  to anon
  using (true)
  with check (true);

create policy "agreement_templates_allow_all_authenticated"
  on public.agreement_templates
  for all
  to authenticated
  using (true)
  with check (true);

create policy "template_fields_allow_all_anon"
  on public.template_fields
  for all
  to anon
  using (true)
  with check (true);

create policy "template_fields_allow_all_authenticated"
  on public.template_fields
  for all
  to authenticated
  using (true)
  with check (true);
