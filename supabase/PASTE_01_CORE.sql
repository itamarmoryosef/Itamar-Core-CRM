-- =============================================================================
-- שלב 1: CORE - הרץ פעם אחת בפרויקט Supabase
-- =============================================================================

-- >>> BEGIN: database.sql
-- Run this entire script in the Supabase SQL Editor (Dashboard → SQL → New query).

-- Extensions (gen_random_uuid)
create extension if not exists "pgcrypto";

-- clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid (),
  full_name text not null,
  id_number text not null,
  phone text,
  fee_amount numeric(12, 2),
  fee_upfront text,
  fee_success text,
  has_signed boolean not null default false,
  signature_url text,
  signed_at timestamptz,
  last_reminder_at timestamptz,
  required_docs jsonb not null default '[]'::jsonb
);

alter table public.clients
  add column if not exists fee_upfront text;

alter table public.clients
  add column if not exists fee_success text;

alter table public.clients
  add column if not exists required_docs jsonb not null default '[]'::jsonb;

alter table public.clients
  add column if not exists status text not null default 'ממתין למסמכים';

alter table public.clients
  add column if not exists total_amount numeric(12, 2);

alter table public.clients
  add column if not exists payment_status text;

alter table public.clients
  add column if not exists agreement_notes text;

alter table public.clients
  add column if not exists custom_fields_data jsonb not null default '{}'::jsonb;

-- agreement .docx templates (active row drives client portal)
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid (),
  name text not null default 'תבנית הסכם פעילה.docx',
  storage_path text not null,
  original_filename text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.templates
  add column if not exists name text;

update public.templates
set
  name = coalesce(nullif(trim(original_filename), ''), 'תבנית הסכם פעילה.docx')
where
  name is null
  or trim(name) = '';

alter table public.templates
  alter column name set default 'תבנית הסכם פעילה.docx';

alter table public.templates
  alter column name set not null;

-- DBs ישנים: נוצרה `templates` בלי is_active; האפליקציה מסננת .eq("is_active", true)
alter table public.templates
  add column if not exists is_active boolean not null default true;

-- documents
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  doc_type text not null,
  status text not null default 'pending',
  file_url text,
  original_filename text,
  storage_path text
);

create index if not exists documents_client_id_idx on public.documents (client_id);

alter table public.documents
  add column if not exists storage_path text;

alter table public.documents
  add column if not exists needs_signature boolean not null default false;

alter table public.documents
  add column if not exists signature_signed_at timestamptz;

alter table public.documents
  add column if not exists signed_pdf_storage_path text;

-- Portal-signed PDF metadata (see also add_documents_portal_signed_columns.sql)
alter table public.documents
  add column if not exists name text;

alter table public.documents
  add column if not exists document_type text;

alter table public.documents
  add column if not exists is_active boolean not null default true;

-- Row Level Security (MVP: open access for anon + authenticated)
alter table public.clients enable row level security;
alter table public.documents enable row level security;
alter table public.templates enable row level security;

-- Drop policies if re-running script (idempotent)
drop policy if exists "clients_allow_all_anon" on public.clients;
drop policy if exists "clients_allow_all_authenticated" on public.clients;
drop policy if exists "documents_allow_all_anon" on public.documents;
drop policy if exists "documents_allow_all_authenticated" on public.documents;
drop policy if exists "templates_allow_all_anon" on public.templates;
drop policy if exists "templates_allow_all_authenticated" on public.templates;

create policy "clients_allow_all_anon"
  on public.clients
  for all
  to anon
  using (true)
  with check (true);

create policy "clients_allow_all_authenticated"
  on public.clients
  for all
  to authenticated
  using (true)
  with check (true);

create policy "documents_allow_all_anon"
  on public.documents
  for all
  to anon
  using (true)
  with check (true);

create policy "documents_allow_all_authenticated"
  on public.documents
  for all
  to authenticated
  using (true)
  with check (true);

create policy "templates_allow_all_anon"
  on public.templates
  for all
  to anon
  using (true)
  with check (true);

create policy "templates_allow_all_authenticated"
  on public.templates
  for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Storage: buckets + policies (required for signature + document uploads)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents-signed', 'documents-signed', true)
on conflict (id) do update
set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('documents-uploads', 'documents-uploads', true)
on conflict (id) do update
set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('documents-templates', 'documents-templates', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "documents_signed_anon_all" on storage.objects;
drop policy if exists "documents_signed_authenticated_all" on storage.objects;
drop policy if exists "documents_uploads_anon_all" on storage.objects;
drop policy if exists "documents_uploads_authenticated_all" on storage.objects;
drop policy if exists "documents_templates_anon_all" on storage.objects;
drop policy if exists "documents_templates_authenticated_all" on storage.objects;

create policy "documents_signed_anon_all"
  on storage.objects
  for all
  to anon
  using (bucket_id = 'documents-signed')
  with check (bucket_id = 'documents-signed');

create policy "documents_signed_authenticated_all"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'documents-signed')
  with check (bucket_id = 'documents-signed');

create policy "documents_uploads_anon_all"
  on storage.objects
  for all
  to anon
  using (bucket_id = 'documents-uploads')
  with check (bucket_id = 'documents-uploads');

create policy "documents_uploads_authenticated_all"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'documents-uploads')
  with check (bucket_id = 'documents-uploads');

create policy "documents_templates_anon_all"
  on storage.objects
  for all
  to anon
  using (bucket_id = 'documents-templates')
  with check (bucket_id = 'documents-templates');

create policy "documents_templates_authenticated_all"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'documents-templates')
  with check (bucket_id = 'documents-templates');

-- ---------------------------------------------------------------------------
-- document_types (dynamic checklist labels + optional download links)
-- ---------------------------------------------------------------------------

create table if not exists public.document_types (
  id uuid primary key default gen_random_uuid (),
  name text not null unique,
  download_link text,
  created_at timestamptz not null default now()
);

alter table public.document_types enable row level security;

drop policy if exists "document_types_allow_all_anon" on public.document_types;
drop policy if exists "document_types_allow_all_authenticated" on public.document_types;

create policy "document_types_allow_all_anon"
  on public.document_types
  for all
  to anon
  using (true)
  with check (true);

create policy "document_types_allow_all_authenticated"
  on public.document_types
  for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- custom_field_sections + custom_field_definitions (CRM grid, Word {{custom_slug}})
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
  slug text not null unique,
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
  ),
  constraint custom_field_definitions_field_type_check check (
    field_type in ('text', 'number', 'date', 'select')
  )
);

alter table public.custom_field_definitions enable row level security;

drop policy if exists "custom_field_definitions_allow_all_anon" on public.custom_field_definitions;
drop policy if exists "custom_field_definitions_allow_all_authenticated" on public.custom_field_definitions;

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

-- ---------------------------------------------------------------------------
-- custom_field_values (optional normalized store; merges over clients.custom_fields_data)
-- ---------------------------------------------------------------------------

create table if not exists public.custom_field_values (
  client_id uuid not null references public.clients (id) on delete cascade,
  definition_id uuid not null references public.custom_field_definitions (id) on delete cascade,
  value_text text not null default '',
  updated_at timestamptz not null default now (),
  primary key (client_id, definition_id)
);

create index if not exists custom_field_values_definition_id_idx
  on public.custom_field_values (definition_id);

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

comment on table public.custom_field_values is 'Per-definition values; admin merges over clients.custom_fields_data when present';

-- ---------------------------------------------------------------------------
-- Client portal short URL: /client/{short_id} (6 chars, unique when set)
-- ---------------------------------------------------------------------------

alter table public.clients
  add column if not exists short_id text;

create unique index if not exists clients_short_id_unique
  on public.clients (short_id)
  where short_id is not null;

alter table public.clients
  add column if not exists agreement_aux_signed_at timestamptz;

-- ---------------------------------------------------------------------------
-- client_statuses (dynamic CRM pipeline + colors; clients.status_id FK)
-- ---------------------------------------------------------------------------

create table if not exists public.client_statuses (
  id uuid primary key default gen_random_uuid (),
  label text not null unique,
  color_hex text not null default '#64748b',
  sort_order int not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now (),
  constraint client_statuses_color_hex_check check (
    color_hex ~ '^#[0-9A-Fa-f]{6}$'
  )
);

alter table public.client_statuses enable row level security;

drop policy if exists "client_statuses_allow_all_anon" on public.client_statuses;
drop policy if exists "client_statuses_allow_all_authenticated" on public.client_statuses;

create policy "client_statuses_allow_all_anon"
  on public.client_statuses
  for all
  to anon
  using (true)
  with check (true);

create policy "client_statuses_allow_all_authenticated"
  on public.client_statuses
  for all
  to authenticated
  using (true)
  with check (true);

insert into public.client_statuses (label, color_hex, sort_order, is_system)
values
  ('ממתין למסמכים', '#0ea5e9', 0, true),
  ('מסמכים הושלמו', '#8b5cf6', 1, true),
  ('הוגש - ממתין לתשובה', '#f59e0b', 2, true),
  ('הסתיים - טופל בהצלחה', '#22c55e', 3, true),
  ('הסתיים - לא קיבל רישיון', '#ef4444', 4, true),
  ('ממתין לחתימה', '#6366f1', 5, true),
  ('חדש', '#14b8a6', 10, false),
  ('בטיפול', '#a855f7', 11, false),
  ('הושלם', '#84cc16', 12, false)
on conflict (label) do nothing;

alter table public.clients
  add column if not exists status_id uuid references public.client_statuses (id) on delete restrict;

update public.clients c
set
  status_id = s.id
from
  public.client_statuses s
where
  c.status_id is null
  and trim(coalesce(c.status, '')) = trim(s.label);

update public.clients c
set
  status_id = d.id
from
  public.client_statuses d
where
  c.status_id is null
  and d.label = 'ממתין למסמכים';

do $$
begin
  if exists (
    select
      1
    from
      public.clients
    where
      status_id is null
  ) then
    raise exception 'clients.status_id backfill incomplete';
  end if;
end
$$;

alter table public.clients
  alter column status_id set not null;

create or replace function public.clients_apply_status_sync ()
returns trigger
language plpgsql
as $$
declare
  v_label text;
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.status_id is not null then
      select
        s.label into v_label
      from
        public.client_statuses s
      where
        s.id = new.status_id;
      if v_label is null then
        raise exception 'clients: invalid status_id %', new.status_id;
      end if;
      new.status := v_label;
    elsif new.status is not null and btrim (coalesce(new.status, '')) <> '' then
      select
        s.id into v_id
      from
        public.client_statuses s
      where
        trim(s.label) = trim(new.status)
      limit
        1;
      if v_id is null then
        raise exception 'clients: unknown status label %', new.status;
      end if;
      new.status_id := v_id;
    else
      select
        s.id,
        s.label into new.status_id,
        new.status
      from
        public.client_statuses s
      where
        s.label = 'ממתין למסמכים'
      limit
        1;
      if new.status_id is null then
        raise exception 'clients: default status row missing';
      end if;
    end if;
    return new;
  end if;

  if new.status_id is distinct from old.status_id and new.status_id is not null then
    select
      s.label into v_label
    from
      public.client_statuses s
    where
      s.id = new.status_id;
    if v_label is null then
      raise exception 'clients: invalid status_id %', new.status_id;
    end if;
    new.status := v_label;
  elsif new.status is distinct from old.status
  and new.status is not null
  and btrim (coalesce(new.status, '')) <> '' then
    select
      s.id into v_id
    from
      public.client_statuses s
    where
      trim(s.label) = trim(new.status)
    limit
      1;
    if v_id is null then
      raise exception 'clients: unknown status label %', new.status;
    end if;
    new.status_id := v_id;
  end if;

  return new;
end;
$$;

drop trigger if exists clients_apply_status_sync_trigger on public.clients;

create trigger clients_apply_status_sync_trigger
before insert or update on public.clients
for each row
execute function public.clients_apply_status_sync ();

create or replace function public.client_statuses_after_label_update ()
returns trigger
language plpgsql
as $$
begin
  if new.label is distinct from old.label then
    update public.clients
    set
      status = new.label
    where
      status_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists client_statuses_propagate_label on public.client_statuses;

create trigger client_statuses_propagate_label
after update of label on public.client_statuses
for each row
execute function public.client_statuses_after_label_update ();

-- ---------------------------------------------------------------------------
-- agreement_templates + template_fields (portal form layout → custom fields)
-- ---------------------------------------------------------------------------

create table if not exists public.agreement_templates (
  id uuid primary key default gen_random_uuid (),
  title text not null,
  description text,
  created_at timestamptz not null default now ()
);

create table if not exists public.template_fields (
  id uuid primary key default gen_random_uuid (),
  template_id uuid not null references public.agreement_templates (id) on delete cascade,
  definition_id uuid not null references public.custom_field_definitions (id) on delete cascade,
  row_number int not null default 1,
  col_span int not null default 4,
  sort_order int not null default 0,
  constraint template_fields_col_span_check check (
    col_span >= 1
    and col_span <= 4
  ),
  constraint template_fields_template_definition_unique unique (template_id, definition_id)
);

create index if not exists template_fields_template_id_idx on public.template_fields (template_id);

alter table public.clients
  add column if not exists agreement_structure_template_id uuid references public.agreement_templates (id) on delete set null;

alter table public.agreement_templates enable row level security;
alter table public.template_fields enable row level security;

drop policy if exists "agreement_templates_allow_all_anon" on public.agreement_templates;
drop policy if exists "agreement_templates_allow_all_authenticated" on public.agreement_templates;
drop policy if exists "template_fields_allow_all_anon" on public.template_fields;
drop policy if exists "template_fields_allow_all_authenticated" on public.template_fields;

create policy "agreement_templates_allow_all_anon"
  on public.agreement_templates
  for all
  to anon
  using (true)
  with check (true);

create policy "agreement_templates_allow_all_authenticated"
  on public.agreement_templates
  for all
  to authenticated
  using (true)
  with check (true);

create policy "template_fields_allow_all_anon"
  on public.template_fields
  for all
  to anon
  using (true)
  with check (true);

create policy "template_fields_allow_all_authenticated"
  on public.template_fields
  for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- signature_templates + signature_template_fields (parallel structured PDF)
-- ---------------------------------------------------------------------------

create table if not exists public.signature_templates (
  id uuid primary key default gen_random_uuid (),
  title text not null,
  description text,
  created_at timestamptz not null default now ()
);

create table if not exists public.signature_template_fields (
  id uuid primary key default gen_random_uuid (),
  template_id uuid not null references public.signature_templates (id) on delete cascade,
  definition_id uuid not null references public.custom_field_definitions (id) on delete cascade,
  row_number int not null default 1,
  col_span int not null default 4,
  sort_order int not null default 0,
  constraint signature_template_fields_col_span_check check (
    col_span >= 1
    and col_span <= 4
  ),
  constraint signature_template_fields_template_definition_unique unique (
    template_id,
    definition_id
  )
);

create index if not exists signature_template_fields_template_id_idx
  on public.signature_template_fields (template_id);

alter table public.clients
  add column if not exists signature_template_id uuid references public.signature_templates (id) on delete set null;

alter table public.signature_templates enable row level security;
alter table public.signature_template_fields enable row level security;

drop policy if exists "signature_templates_allow_all_anon" on public.signature_templates;
drop policy if exists "signature_templates_allow_all_authenticated" on public.signature_templates;
drop policy if exists "signature_template_fields_allow_all_anon" on public.signature_template_fields;
drop policy if exists "signature_template_fields_allow_all_authenticated" on public.signature_template_fields;

create policy "signature_templates_allow_all_anon"
  on public.signature_templates
  for all
  to anon
  using (true)
  with check (true);

create policy "signature_templates_allow_all_authenticated"
  on public.signature_templates
  for all
  to authenticated
  using (true)
  with check (true);

create policy "signature_template_fields_allow_all_anon"
  on public.signature_template_fields
  for all
  to anon
  using (true)
  with check (true);

create policy "signature_template_fields_allow_all_authenticated"
  on public.signature_template_fields
  for all
  to authenticated
  using (true)
  with check (true);


-- >>> END: database.sql

-- >>> BEGIN: profiles_team.sql
-- אופציונלי: טבלת profiles מסונכרנת עם auth.users (לתצוגה / תפקידים בעתיד).
-- הרצה ב-Supabase SQL Editor. אפליקציית ניהול הצוות משתמשת ב-Auth Admin API לרשימה.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'staff',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- MVP: התאימו למדיניות האבטחה שלכם (למשל רק authenticated).
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);

comment on table public.profiles is
  'Team & roles: role admin = ניהול צוות באפליקציה; staff = משתמש רגיל.';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'staff'));

-- מנהל ראשון: לאחר התחברות ראשונה, החליפו UUID ואימייל (Authentication → Users):
-- insert into public.profiles (id, email, role)
-- values ('00000000-0000-0000-0000-000000000000', 'admin@example.com', 'admin')
-- on conflict (id) do update set role = 'admin', email = excluded.email;

-- סנכרון אוטומטי כשנרשם משתמש חדש ב-Auth:
create or replace function public.handle_new_auth_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'staff')
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user ();


-- >>> END: profiles_team.sql

-- >>> BEGIN: settings.sql
-- הגדרות מערכת (מפתח/ערך). הרצה ב-Supabase SQL Editor.
-- RLS פעיל ללא מדיניות ל-anon/authenticated — קריאה/כתיבה דרך Next.js עם SUPABASE_SERVICE_ROLE_KEY בלבד.

create table if not exists public.settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

comment on table public.settings is
  'הגדרות כלליות. מפתחות: admin_notification_phone (וואטסאפ למנהל), grow_payment_base_url (קישור בסיס לחיוב Grow).';

insert into public.settings (key, value)
values ('admin_notification_phone', '')
on conflict (key) do nothing;

insert into public.settings (key, value)
values ('grow_payment_base_url', '')
on conflict (key) do nothing;


-- >>> END: settings.sql

-- >>> BEGIN: migrations/crm_v2_enhancements.sql
-- Run in Supabase SQL Editor. Idempotent.
-- CRM: per-client field assignment, agent, signature audit, optional status label refresh.

-- Per-client: only these custom_field_definitions appear in agreement/signature (NULL = all).
alter table public.clients
  add column if not exists assigned_field_definition_ids uuid[];

comment on column public.clients.assigned_field_definition_ids is
  'If set and non-empty, only these field definition IDs are shown in portal/PDF; NULL means use full template.';

-- Agent (team member profile) assigned to this client
alter table public.clients
  add column if not exists agent_profile_id uuid;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    if not exists (
      select 1 from pg_constraint where conname = 'clients_agent_profile_id_fkey'
    ) then
      alter table public.clients
        add constraint clients_agent_profile_id_fkey
        foreign key (agent_profile_id) references public.profiles (id) on delete set null;
    end if;
  end if;
end $$;

-- Captured on the server when the client completes a signature (IP from reverse proxy)
alter table public.clients
  add column if not exists signature_client_ip text;

alter table public.clients
  add column if not exists signature_user_agent text;

comment on column public.clients.signature_client_ip is
  'Client IP at signature time (set by /api/portal/signature-audit), not from browser JSON.';

-- Generic CRM status (relabel license-specific default if present)
update public.client_statuses
set label = 'הסתיים - ללא מכירה'
where label = 'הסתיים - לא קיבל רישיון';


-- >>> END: migrations/crm_v2_enhancements.sql

