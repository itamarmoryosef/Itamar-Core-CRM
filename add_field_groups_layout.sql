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
