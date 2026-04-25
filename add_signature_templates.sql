-- Parallel "structured signature" templates (safety-first). Does not modify Word `templates` or portal APIs.
-- Run in Supabase SQL Editor. Requires public.custom_field_definitions.

create table if not exists public.signature_templates (
  id uuid primary key default gen_random_uuid (),
  title text not null,
  description text,
  created_at timestamptz not null default now ()
);

create table if not exists public.signature_template_fields (
  id uuid primary key default gen_random_uuid (),
  template_id uuid not null references public.signature_templates (id) on delete cascade,
  definition_id uuid not null references public.custom_field_definitions (id) on delete cascade,
  row_number int not null default 1,
  col_span int not null default 4,
  sort_order int not null default 0,
  constraint signature_template_fields_col_span_check check (
    col_span >= 1
    and col_span <= 4
  ),
  constraint signature_template_fields_template_definition_unique unique (
    template_id,
    definition_id
  )
);

create index if not exists signature_template_fields_template_id_idx
  on public.signature_template_fields (template_id);

alter table public.clients
  add column if not exists signature_template_id uuid references public.signature_templates (id) on delete set null;

alter table public.signature_templates enable row level security;
alter table public.signature_template_fields enable row level security;

drop policy if exists "signature_templates_allow_all_anon" on public.signature_templates;
drop policy if exists "signature_templates_allow_all_authenticated" on public.signature_templates;
drop policy if exists "signature_template_fields_allow_all_anon" on public.signature_template_fields;
drop policy if exists "signature_template_fields_allow_all_authenticated" on public.signature_template_fields;

create policy "signature_templates_allow_all_anon"
  on public.signature_templates
  for all
  to anon
  using (true)
  with check (true);

create policy "signature_templates_allow_all_authenticated"
  on public.signature_templates
  for all
  to authenticated
  using (true)
  with check (true);

create policy "signature_template_fields_allow_all_anon"
  on public.signature_template_fields
  for all
  to anon
  using (true)
  with check (true);

create policy "signature_template_fields_allow_all_authenticated"
  on public.signature_template_fields
  for all
  to authenticated
  using (true)
  with check (true);
