-- Yoatzim-style grid layout: sections + row_number + column_span (1–4 in a 4-col grid).
-- Run after add_field_groups_layout.sql if upgrading; safe to re-run with IF NOT EXISTS / guards.

create table if not exists public.custom_field_sections (
  id uuid primary key default gen_random_uuid (),
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.custom_field_sections enable row level security;

drop policy if exists "custom_field_sections_allow_all_anon" on public.custom_field_sections;
drop policy if exists "custom_field_sections_allow_all_authenticated" on public.custom_field_sections;

create policy "custom_field_sections_allow_all_anon"
  on public.custom_field_sections
  for all
  to anon
  using (true)
  with check (true);

create policy "custom_field_sections_allow_all_authenticated"
  on public.custom_field_sections
  for all
  to authenticated
  using (true)
  with check (true);

-- Seed sections from legacy field_groups (same UUIDs so FKs line up)
do $$
begin
  if exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = 'field_groups'
  ) then
    insert into public.custom_field_sections (id, title, sort_order, created_at)
    select
      fg.id,
      fg.title,
      fg.sort_order,
      coalesce(fg.created_at, now())
    from public.field_groups fg
    on conflict (id) do nothing;
  end if;
end $$;

alter table public.custom_field_definitions
  add column if not exists section_id uuid references public.custom_field_sections (id) on delete set null;

alter table public.custom_field_definitions
  add column if not exists row_number int not null default 1;

alter table public.custom_field_definitions
  add column if not exists column_span int not null default 4;

update public.custom_field_definitions f
set
  section_id = coalesce(f.section_id, f.group_id)
where
  exists (
    select 1
    from information_schema.columns c
    where
      c.table_schema = 'public'
      and c.table_name = 'custom_field_definitions'
      and c.column_name = 'group_id'
  )
  and f.group_id is not null;

update public.custom_field_definitions
set column_span = case
  trim(width)
  when '1/4' then 1
  when '1/3' then 2
  when '1/2' then 2
  when 'full' then 4
  else 4
end
where
  exists (
    select 1
    from information_schema.columns c
    where
      c.table_schema = 'public'
      and c.table_name = 'custom_field_definitions'
      and c.column_name = 'width'
  );

update public.custom_field_definitions
set column_span = 4
where column_span < 1
  or column_span > 4;

alter table public.custom_field_definitions
  drop constraint if exists custom_field_definitions_column_span_check;

alter table public.custom_field_definitions
  add constraint custom_field_definitions_column_span_check check (
    column_span >= 1
    and column_span <= 4
  );

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where
      table_schema = 'public'
      and table_name = 'custom_field_definitions'
      and column_name = 'group_id'
  ) then
    alter table public.custom_field_definitions drop column group_id;
  end if;
  if exists (
    select 1
    from information_schema.columns
    where
      table_schema = 'public'
      and table_name = 'custom_field_definitions'
      and column_name = 'width'
  ) then
    alter table public.custom_field_definitions drop constraint if exists custom_field_definitions_width_check;
    alter table public.custom_field_definitions drop column width;
  end if;
end $$;

comment on table public.custom_field_sections is 'סקשנים לפריסת שדות CRM (כרטיסים)';
comment on column public.custom_field_definitions.row_number is 'מספר שורה בתוך הסקשן (1+)';
comment on column public.custom_field_definitions.column_span is 'רוחב בגריד 4 עמודות: 1–4 (4 = שורה מלאה)';
comment on column public.custom_field_definitions.sort_order is 'מיקום בתוך השורה (שמאל לימין)';
