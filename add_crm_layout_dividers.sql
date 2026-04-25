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
