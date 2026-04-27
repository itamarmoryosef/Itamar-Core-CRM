-- שדה כן/לא (yes_no) — הרצה ב-Supabase SQL Editor.

alter table public.custom_field_definitions
  drop constraint if exists custom_field_definitions_field_type_check;

alter table public.custom_field_definitions
  add constraint custom_field_definitions_field_type_check
  check (
    field_type in (
      'text',
      'number',
      'date',
      'select',
      'multi_select',
      'yes_no',
      'calculation'
    )
  );
