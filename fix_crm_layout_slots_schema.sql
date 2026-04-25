-- REQUIRED for saving layout / new fields: adds `column_span` (and divider support) to `crm_layout_slots`.
-- Run in Supabase SQL Editor when REST errors: column crm_layout_slots.column_span does not exist
-- or when POST /rest/v1/crm_layout_slots returns 400.

alter table public.crm_layout_slots
  add column if not exists column_span int not null default 4;

alter table public.crm_layout_slots
  add column if not exists divider_config jsonb;

-- Optional: widen span cap to match app (1–4 units); drop old check if present
alter table public.crm_layout_slots
  drop constraint if exists crm_layout_slots_column_span_check;

alter table public.crm_layout_slots
  add constraint crm_layout_slots_column_span_check check (
    column_span >= 1
    and column_span <= 4
  );

-- Match add_crm_layout_dividers.sql if that migration was never applied.
-- Inline/column CHECK on slot_kind is often auto-named crm_layout_slots_slot_kind_check.
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

comment on column public.crm_layout_slots.column_span is 'Width units 1–4 in the 12-col CRM grid';
comment on column public.crm_layout_slots.divider_config is 'When slot_kind=divider: JSON config';
