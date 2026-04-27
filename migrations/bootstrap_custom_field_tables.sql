-- =============================================================================
-- אם PostgREST מדווח: "Could not find the table public.custom_field_sections"
-- — הריץ פעם אחת. אידמפוטנטי. אחר כך: migrations/add_multi_tenancy_organizations.sql (אם עדיין לא)
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- custom_field_sections + custom_field_definitions
-- (תואם PASTE_01_CORE; מוסיף formula/calculation לשימוש ב־UI)
-- ---------------------------------------------------------------------------

create table if not exists public.custom_field_sections (
  id uuid primary key default gen_random_uuid (),
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now ()
);

alter table public.custom_field_sections enable row level security;

drop policy if exists "custom_field_sections_allow_all_anon" on public.custom_field_sections;
drop policy if exists "custom_field_sections_allow_all_authenticated" on public.custom_field_sections;
drop policy if exists "custom_field_sections_tenant" on public.custom_field_sections;

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

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid (),
  label text not null,
  slug text not null,
  field_type text not null default 'text',
  section_id uuid references public.custom_field_sections (id) on delete set null,
  row_number int not null default 1,
  column_span int not null default 4,
  options jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now (),
  constraint custom_field_definitions_column_span_check check (
    column_span >= 1
    and column_span <= 4
  )
);

-- slug unique: יוחלף ל־(organization_id, lower(slug)) אחרי multi-tenancy; כאן DB ישן/בודד
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where
      conname = 'custom_field_definitions_slug_key'
      and conrelid = 'public.custom_field_definitions'::regclass
  ) then
    alter table public.custom_field_definitions
      add constraint custom_field_definitions_slug_key unique (slug);
  end if;
end $$;

alter table public.custom_field_definitions
  add column if not exists formula text;

comment on column public.custom_field_definitions.formula is
  'For calculation: expression with {{slug}} placeholders.';

alter table public.custom_field_definitions
  drop constraint if exists custom_field_definitions_field_type_check;

update public.custom_field_definitions
set field_type = 'text'
where
  field_type is null
  or field_type = ''
  or field_type not in ('text', 'number', 'date', 'select', 'calculation');

alter table public.custom_field_definitions
  add constraint custom_field_definitions_field_type_check
    check (field_type in ('text', 'number', 'date', 'select', 'calculation'));

alter table public.custom_field_definitions enable row level security;

drop policy if exists "custom_field_definitions_allow_all_anon" on public.custom_field_definitions;
drop policy if exists "custom_field_definitions_allow_all_authenticated" on public.custom_field_definitions;
drop policy if exists "custom_field_definitions_tenant" on public.custom_field_definitions;

create policy "custom_field_definitions_allow_all_anon"
  on public.custom_field_definitions
  for all
  to anon
  using (true)
  with check (true);

create policy "custom_field_definitions_allow_all_authenticated"
  on public.custom_field_definitions
  for all
  to authenticated
  using (true)
  with check (true);

comment on table public.custom_field_sections is 'סקשנים לפריסת שדות CRM (כרטיסים)';
comment on table public.custom_field_definitions is 'שדות דינמיים: slug, סוג, פריסה';

-- ---------------------------------------------------------------------------
-- custom_field_values (רק אם public.clients כבר קיים; אחרת — הרץ אחרי PASTE_01)
-- אם custom_field_values כבר הייתה בלי definition_id (למשל field_id) — מחל/מתקן.
-- ---------------------------------------------------------------------------

do $$
declare
  t_cls regclass := to_regclass ('public.clients');
  t_vals regclass := to_regclass ('public.custom_field_values');
  n_rows bigint;
  has_def boolean;
  has_fid boolean;
  has_cfdid boolean;
  has_cust_fid boolean;
begin
  if t_cls is null then
    raise notice 'public.clients not found: skipped custom_field_values. Run PASTE_01_CORE, then re-run this file.';

    return;
  end if;

  if t_vals is not null then
    select exists (
        select
          1
        from information_schema.columns
        where
          table_schema = 'public'
          and table_name = 'custom_field_values'
          and column_name = 'definition_id'
      )
      into has_def;

    select exists (
        select
          1
        from information_schema.columns
        where
          table_schema = 'public'
          and table_name = 'custom_field_values'
          and column_name = 'field_id'
      )
      into has_fid;

    select exists (
        select
          1
        from information_schema.columns
        where
          table_schema = 'public'
          and table_name = 'custom_field_values'
          and column_name = 'custom_field_definition_id'
      )
      into has_cfdid;

    select exists (
        select
          1
        from information_schema.columns
        where
          table_schema = 'public'
          and table_name = 'custom_field_values'
          and column_name = 'custom_field_id'
      )
      into has_cust_fid;

    if not has_def
    and has_fid then
      execute 'alter table public.custom_field_values rename column field_id to definition_id';
      has_def := true;
    end if;

    if not has_def
    and has_cfdid then
      execute 'alter table public.custom_field_values rename column custom_field_definition_id to definition_id';
      has_def := true;
    end if;

    if not has_def
    and has_cust_fid then
      execute 'alter table public.custom_field_values rename column custom_field_id to definition_id';
      has_def := true;
    end if;

    if not has_def then
      select
        count(*)::bigint
        into
          n_rows
      from
        public.custom_field_values;

      if n_rows = 0 then
        -- טבלה ריקה/שמיתית שלא תואמת לסכימה: נחליף
        raise notice
          'custom_field_values exists without definition_id: dropping empty table to recreate.';

        execute
          'drop table public.custom_field_values cascade';
        t_vals := null;
      else
        raise exception
          'custom_field_values has % row(s) but no definition_id (or field_id to rename). Inspect table columns; migrate manually, then re-run.',
          n_rows;
      end if;
    end if;
  end if;

  if t_vals is null then
    create table public.custom_field_values (
      client_id uuid not null references public.clients (id) on delete cascade,
      definition_id uuid not null references public.custom_field_definitions (id) on delete cascade,
      value_text text not null default '',
      updated_at timestamptz not null default now (),
      primary key (client_id, definition_id)
    );
  else
    alter table public.custom_field_values
    add column if not exists value_text text not null default '';
    alter table public.custom_field_values
    add column if not exists updated_at timestamptz not null default now();
  end if;

  if exists (
    select
      1
    from information_schema.columns
    where
      table_schema = 'public'
      and table_name = 'custom_field_values'
      and column_name = 'definition_id'
  ) then
    create index if not exists custom_field_values_definition_id_idx
      on public.custom_field_values (definition_id);
  end if;

  alter table public.custom_field_values enable row level security;
  drop policy if exists "custom_field_values_allow_all_anon" on public.custom_field_values;
  drop policy if exists "custom_field_values_allow_all_authenticated" on public.custom_field_values;
  create policy "custom_field_values_allow_all_anon"
    on public.custom_field_values
    for all
    to anon
    using (true)
    with check (true);
  create policy "custom_field_values_allow_all_authenticated"
    on public.custom_field_values
    for all
    to authenticated
    using (true)
    with check (true);
end
$$;

-- רענון cache של PostgREST (לרוב אוטומטי; בקשה ידנית בלשונית API אם צריך)
notify pgrst, 'reload schema';
