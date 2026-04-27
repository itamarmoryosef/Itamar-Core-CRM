-- Select-field options for custom_field_definitions (jsonb array of strings).
-- Idempotent. Run in Supabase if you see: column custom_field_definitions.options does not exist

alter table public.custom_field_definitions
  add column if not exists options jsonb not null default '[]'::jsonb;

comment on column public.custom_field_definitions.options is
  'לשדה select: מערך מחרוזות ["א","ב"]';
