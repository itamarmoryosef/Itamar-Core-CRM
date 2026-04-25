-- Unified client-card canvas: core + custom field placements.
-- Run after custom_field_sections exists. After add_crm_layout_sections.sql,
-- section_id references crm_layout_sections (re-run FK migration if needed).

create table if not exists public.crm_layout_slots (
  id uuid primary key default gen_random_uuid (),
  section_id uuid not null references public.custom_field_sections (id) on delete cascade,
  row_number int not null default 1,
  column_span int not null default 4,
  sort_order int not null default 0,
  slot_kind text not null,
  core_key text,
  definition_id uuid references public.custom_field_definitions (id) on delete cascade,
  created_at timestamptz not null default now (),
  constraint crm_layout_slots_column_span_check check (
    column_span >= 1
    and column_span <= 4
  ),
  constraint crm_layout_slots_kind_check check (slot_kind in ('core', 'custom')),
  constraint crm_layout_slots_ref_check check (
    (
      slot_kind = 'core'
      and core_key is not null
      and definition_id is null
    )
    or (
      slot_kind = 'custom'
      and definition_id is not null
      and core_key is null
    )
  )
);

create unique index if not exists crm_layout_slots_definition_id_key
  on public.crm_layout_slots (definition_id)
  where definition_id is not null;

create unique index if not exists crm_layout_slots_section_core_key
  on public.crm_layout_slots (section_id, core_key)
  where slot_kind = 'core'
  and core_key is not null;

create index if not exists crm_layout_slots_section_row_idx
  on public.crm_layout_slots (section_id, row_number, sort_order);

alter table public.crm_layout_slots enable row level security;

drop policy if exists "crm_layout_slots_allow_all_anon" on public.crm_layout_slots;
drop policy if exists "crm_layout_slots_allow_all_authenticated" on public.crm_layout_slots;

create policy "crm_layout_slots_allow_all_anon"
  on public.crm_layout_slots
  for all
  to anon
  using (true)
  with check (true);

create policy "crm_layout_slots_allow_all_authenticated"
  on public.crm_layout_slots
  for all
  to authenticated
  using (true)
  with check (true);

-- Backfill from legacy definition positions (idempotent per definition).
insert into public.crm_layout_slots (
  section_id,
  row_number,
  column_span,
  sort_order,
  slot_kind,
  definition_id
)
select
  d.section_id,
  d.row_number,
  d.column_span,
  d.sort_order,
  'custom',
  d.id
from public.custom_field_definitions d
where
  d.section_id is not null
  and not exists (
    select 1
    from public.crm_layout_slots s
    where
      s.definition_id = d.id
  );
