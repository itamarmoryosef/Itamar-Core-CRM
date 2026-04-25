-- =============================================================================
-- CRM layout — סקריפט אחד להדבקה ב-Supabase SQL Editor
-- דורש: public.custom_field_sections, public.custom_field_definitions
-- אידמפוטנטי: אפשר להריץ שוב בלי להרוס נתונים קיימים
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) מודולי פריסה (crm_layout_sections) + סנכרון מ-custom_field_sections
-- ---------------------------------------------------------------------------
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

comment on table public.crm_layout_sections is 'מודולי פריסה לכרטיס CRM (מעצב + לקוח)';

-- ---------------------------------------------------------------------------
-- 2) טבלת slots (אם עדיין לא קיימת) — FK ראשוני ל-custom_field_sections
-- ---------------------------------------------------------------------------
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

-- עמודות שאולי חסרות בטבלה ישנה
alter table public.crm_layout_slots
  add column if not exists column_span int not null default 4;

alter table public.crm_layout_slots
  add column if not exists divider_config jsonb;

-- אילוצי רוחב עמודה (1–4)
alter table public.crm_layout_slots
  drop constraint if exists crm_layout_slots_column_span_check;

alter table public.crm_layout_slots
  add constraint crm_layout_slots_column_span_check check (
    column_span >= 1
    and column_span <= 4
  );

-- מחיצות + סוגי slots מעודכנים
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

comment on column public.crm_layout_slots.column_span is 'יחידות רוחב 1–4 ברשת 12 עמודות';
comment on column public.crm_layout_slots.divider_config is 'כש־slot_kind=divider: JSON (title, thickness_px, color_hex, style)';

-- ---------------------------------------------------------------------------
-- 3) FK: section_id → crm_layout_sections (אותם UUID כמו ב-custom_field_sections)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4) אינדקסים + RLS על crm_layout_slots
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5) Backfill: שדות מותאמים שעדיין לא מופיעים כ-slots
-- ---------------------------------------------------------------------------
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
  coalesce(d.column_span, 4),
  d.sort_order,
  'custom',
  d.id
from public.custom_field_definitions d
where
  d.section_id is not null
  and not exists (
    select 1
    from public.crm_layout_slots s
    where s.definition_id = d.id
  );

-- =============================================================================
-- סיום. אם PostgREST עדיין לא רואה עמודות: Dashboard → Settings → API →
-- Reload schema (או שירות Pro עם NOTIFY לפי התיעוד שלכם).
-- =============================================================================
