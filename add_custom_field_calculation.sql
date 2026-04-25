-- Advanced CRM fields: calculation type + formula column. Run in Supabase SQL Editor.

alter table public.custom_field_definitions
  add column if not exists formula text;

comment on column public.custom_field_definitions.formula is
  'לשדה calculation: ביטוי עם {{slug}} או {{custom_slug}} (ערכים מספריים משדות אחרים)';

alter table public.custom_field_definitions
  drop constraint if exists custom_field_definitions_field_type_check;

update public.custom_field_definitions
set field_type = 'text'
where field_type not in ('text', 'number', 'date', 'select', 'calculation');

alter table public.custom_field_definitions
  add constraint custom_field_definitions_field_type_check
    check (field_type in ('text', 'number', 'date', 'select', 'calculation'));
