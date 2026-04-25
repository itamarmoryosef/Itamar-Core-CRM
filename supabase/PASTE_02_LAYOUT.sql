-- =============================================================================
-- שלב 2: פריסת כרטיס CRM (מעצב / לוח) - אחרי שלב 1
-- אל תריץ יחד עם paste_crm_layout_supabase.sql בלי לבדוק
-- =============================================================================

-- >>>>>>>>>>>>>>>>>> BEGIN: add_field_groups_layout.sql <<<<<<<<<<<<<<<<<<
-- CRM layout: field_groups + extended custom_field_definitions. Run in Supabase SQL Editor.

create table if not exists public.field_groups (
  id uuid primary key default gen_random_uuid (),
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.field_groups enable row level security;

drop policy if exists "field_groups_allow_all_anon" on public.field_groups;
drop policy if exists "field_groups_allow_all_authenticated" on public.field_groups;

create policy "field_groups_allow_all_anon"
  on public.field_groups
  for all
  to anon
  using (true)
  with check (true);

create policy "field_groups_allow_all_authenticated"
  on public.field_groups
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.custom_field_definitions
  add column if not exists group_id uuid references public.field_groups (id) on delete set null;

alter table public.custom_field_definitions
  add column if not exists options jsonb not null default '[]'::jsonb;

alter table public.custom_field_definitions
  add column if not exists sort_order int not null default 0;

alter table public.custom_field_definitions
  add column if not exists width text default 'full';

update public.custom_field_definitions
set width = 'full'
where width is null or trim(width) = '';

update public.custom_field_definitions
set width = 'full'
where width not in ('1/4', '1/3', '1/2', 'full');

alter table public.custom_field_definitions
  alter column width set default 'full';

alter table public.custom_field_definitions
  alter column width set not null;

alter table public.custom_field_definitions
  drop constraint if exists custom_field_definitions_width_check;

alter table public.custom_field_definitions
  add constraint custom_field_definitions_width_check
    check (width in ('1/4', '1/3', '1/2', 'full'));

update public.custom_field_definitions
set field_type = 'text'
where field_type = 'textarea';

update public.custom_field_definitions
set field_type = 'text'
where field_type not in ('text', 'number', 'date', 'select');

alter table public.custom_field_definitions
  drop constraint if exists custom_field_definitions_field_type_check;

alter table public.custom_field_definitions
  add constraint custom_field_definitions_field_type_check
    check (field_type in ('text', 'number', 'date', 'select'));

comment on table public.field_groups is 'כרטיסי CRM — קיבוץ שדות מותאמים';
comment on column public.custom_field_definitions.options is 'לשדה select: מערך מחרוזות ["א","ב"]';


-- >>>>>>>>>>>>>>>>>> END: add_field_groups_layout.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_crm_layout_slots.sql <<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>> END: add_crm_layout_slots.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_crm_layout_sections.sql <<<<<<<<<<<<<<<<<<
-- Modular CRM layout sections (card + designer). Run after custom_field_sections + crm_layout_slots exist.
-- Backfills from custom_field_sections (same ids), then repoints FKs.

create table if not exists public.crm_layout_sections (
  id uuid primary key default gen_random_uuid (),
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now ()
);

alter table public.crm_layout_sections enable row level security;

drop policy if exists "crm_layout_sections_allow_all_anon" on public.crm_layout_sections;
drop policy if exists "crm_layout_sections_allow_all_authenticated" on public.crm_layout_sections;

create policy "crm_layout_sections_allow_all_anon"
  on public.crm_layout_sections
  for all
  to anon
  using (true)
  with check (true);

create policy "crm_layout_sections_allow_all_authenticated"
  on public.crm_layout_sections
  for all
  to authenticated
  using (true)
  with check (true);

insert into public.crm_layout_sections (id, title, sort_order, created_at)
select id, title, sort_order, created_at
from public.custom_field_sections
on conflict (id) do nothing;

alter table public.crm_layout_slots
  drop constraint if exists crm_layout_slots_section_id_fkey;

alter table public.crm_layout_slots
  add constraint crm_layout_slots_section_id_fkey
  foreign key (section_id) references public.crm_layout_sections (id) on delete cascade;

alter table public.custom_field_definitions
  drop constraint if exists custom_field_definitions_section_id_fkey;

alter table public.custom_field_definitions
  add constraint custom_field_definitions_section_id_fkey
  foreign key (section_id) references public.crm_layout_sections (id) on delete set null;

comment on table public.crm_layout_sections is 'מודולי פריסה לכרטיס CRM (מעצב + לקוח)';


-- >>>>>>>>>>>>>>>>>> END: add_crm_layout_sections.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_crm_layout_dividers.sql <<<<<<<<<<<<<<<<<<
-- Section dividers on the CRM client-card canvas (visual only; no Word slugs).
-- Run after add_crm_layout_slots.sql

alter table public.crm_layout_slots
  add column if not exists divider_config jsonb;

alter table public.crm_layout_slots
  drop constraint if exists crm_layout_slots_kind_check;

alter table public.crm_layout_slots
  drop constraint if exists crm_layout_slots_slot_kind_check;

alter table public.crm_layout_slots
  add constraint crm_layout_slots_kind_check check (
    slot_kind in ('core', 'custom', 'divider')
  );

alter table public.crm_layout_slots
  drop constraint if exists crm_layout_slots_ref_check;

alter table public.crm_layout_slots
  add constraint crm_layout_slots_ref_check check (
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
    or (
      slot_kind = 'divider'
      and core_key is null
      and definition_id is null
      and column_span = 4
    )
  );

comment on column public.crm_layout_slots.divider_config is 'When slot_kind=divider: { title, thickness_px (1|2|4), color_hex, style (solid|dashed|minimal) }';


-- >>>>>>>>>>>>>>>>>> END: add_crm_layout_dividers.sql

