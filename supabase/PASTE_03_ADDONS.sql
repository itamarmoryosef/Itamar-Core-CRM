-- =============================================================================
-- שלב 3: תוספות/שדרוגי סכימה (רבים כבר ב-database.sql; IF NOT EXISTS בטוח)
-- הרץ אחרי שלב 1 (ואופציונלית אחרי שלב 2)
-- =============================================================================

-- >>>>>>>>>>>>>>>>>> BEGIN: add_custom_field_calculation.sql <<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>> END: add_custom_field_calculation.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_custom_field_sections.sql <<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>> END: add_custom_field_sections.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_custom_field_values.sql <<<<<<<<<<<<<<<<<<
-- Optional normalized store for custom field answers (one row per client + definition).
-- The app still uses `clients.custom_fields_data` JSONB as the primary store; when this
-- table exists, the admin client card merges `value_text` over JSON by `definition_id`.

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

comment on table public.custom_field_values is 'Per-definition values; admin UI merges over clients.custom_fields_data when present';


-- >>>>>>>>>>>>>>>>>> END: add_custom_field_values.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_custom_fields.sql <<<<<<<<<<<<<<<<<<
-- Run in Supabase SQL Editor if upgrading an existing project.

alter table public.clients
  add column if not exists custom_fields_data jsonb not null default '{}'::jsonb;

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid (),
  label text not null,
  slug text not null unique,
  field_type text not null default 'text',
  created_at timestamptz not null default now()
);

comment on table public.custom_field_definitions is
  'שדות דינמיים ללקוח; ב-Word: {{custom_<slug>}}';

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


-- >>>>>>>>>>>>>>>>>> END: add_custom_fields.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_client_statuses.sql <<<<<<<<<<<<<<<<<<
-- Dynamic CRM client statuses (Yoatzim-style). Run in Supabase SQL Editor after backups.
-- Adds client_statuses, clients.status_id, sync triggers, seeds existing Hebrew labels.

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

-- Seed: core pipeline + portal/cron semantics (system). Extra CRM labels for Yoatzim-style workflows.
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

-- Fail loudly if any row still lacks status_id (unexpected status text).
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
    raise exception 'clients.status_id backfill incomplete: add client_statuses rows for orphan labels or fix clients.status';
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

  -- UPDATE
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


-- >>>>>>>>>>>>>>>>>> END: add_client_statuses.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_client_short_id.sql <<<<<<<<<<<<<<<<<<
-- Short public ID for client portal URLs (/client/{short_id}).
-- Run in Supabase SQL Editor after backup.

alter table public.clients
  add column if not exists short_id text;

comment on column public.clients.short_id is
  '6-char public slug for /client/{short_id}; unique when set. Legacy rows backfilled by app on first admin view or manually.';

create unique index if not exists clients_short_id_unique
  on public.clients (short_id)
  where short_id is not null;


-- >>>>>>>>>>>>>>>>>> END: add_client_short_id.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_clients_created_at.sql <<<<<<<<<<<<<<<<<<
-- Prerequisites: `public.clients` must already exist (run `database.sql` / migrations first).
-- This file only adds `created_at`. It does NOT fix:
--   "Could not find the table 'public.clients' in the schema cache"
-- For that: ensure you're on the correct Supabase project, create the table, then reload PostgREST cache:
--   NOTIFY pgrst, 'reload schema';
--
-- Supabase SQL Editor: מיון לקוחות לפי תאריך יצירה בלוח הבקרה.
alter table public.clients
  add column if not exists created_at timestamptz not null default now();

comment on column public.clients.created_at is
  'זמן יצירת רשומת הלקוח (למיון ברשימת האדמין).';


-- >>>>>>>>>>>>>>>>>> END: add_clients_created_at.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_client_notes.sql <<<<<<<<<<<<<<<<<<
-- Internal per-client notes (admin UI). Run in Supabase SQL Editor.

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_notes_client_created
  on public.client_notes (client_id, created_at desc);

comment on table public.client_notes is 'הערות פנימיות לתיק לקוח — מוצג באדמין בלבד.';

alter table public.client_notes enable row level security;

drop policy if exists "client_notes_allow_all_anon" on public.client_notes;
drop policy if exists "client_notes_allow_all_authenticated" on public.client_notes;

create policy "client_notes_allow_all_anon"
  on public.client_notes
  for all
  to anon
  using (true)
  with check (true);

create policy "client_notes_allow_all_authenticated"
  on public.client_notes
  for all
  to authenticated
  using (true)
  with check (true);


-- >>>>>>>>>>>>>>>>>> END: add_client_notes.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_client_agreement_notes.sql <<<<<<<<<<<<<<<<<<
-- Run in Supabase SQL Editor if the column is missing.
-- Text shown in the client agreement PDF before the signature (portal). Separate from payment_status / finance.

alter table public.clients
  add column if not exists agreement_notes text;

comment on column public.clients.agreement_notes is 'הערות להסכם — מוצג ב-PDF לפני החתימה; לא כולל פירוט תשלום (payment_status)';


-- >>>>>>>>>>>>>>>>>> END: add_client_agreement_notes.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_client_reminders_enabled.sql <<<<<<<<<<<<<<<<<<
-- Per-client master switch for cron-driven WhatsApp reminders (Supabase SQL Editor).

alter table public.clients
  add column if not exists reminders_enabled boolean not null default true;

comment on column public.clients.reminders_enabled is
  'When false, /api/cron/reminders skips automatic document pings, manual due-date pings, and pending client_scheduled_reminders for this client.';


-- >>>>>>>>>>>>>>>>>> END: add_client_reminders_enabled.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_client_reminders_hybrid.sql <<<<<<<<<<<<<<<<<<
-- Hybrid reminder mode + scheduled manual WhatsApp reminders (Supabase SQL Editor).

alter table public.clients
  add column if not exists reminder_mode text not null default 'auto';

alter table public.clients
  drop constraint if exists clients_reminder_mode_check;

alter table public.clients
  add constraint clients_reminder_mode_check
  check (reminder_mode in ('auto', 'manual'));

alter table public.clients
  add column if not exists next_custom_reminder timestamptz;

comment on column public.clients.reminder_mode is
  'auto: cron sends doc reminders every ~3 days from last_reminder_at; manual: send only when now >= next_custom_reminder, then revert to auto.';

comment on column public.clients.next_custom_reminder is
  'When reminder_mode=manual, earliest time for the next automated-style document reminder.';

create table if not exists public.client_scheduled_reminders (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  scheduled_at timestamptz not null,
  message text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now (),
  sent_at timestamptz,
  constraint client_scheduled_reminders_status_check
    check (status in ('pending', 'sent', 'cancelled', 'failed'))
);

create index if not exists client_scheduled_reminders_pending_due_idx
  on public.client_scheduled_reminders (scheduled_at)
  where status = 'pending';

create index if not exists client_scheduled_reminders_client_idx
  on public.client_scheduled_reminders (client_id);

comment on table public.client_scheduled_reminders is
  'Admin-scheduled one-off WhatsApp messages; processed by /api/cron/reminders. The cron job must use SUPABASE_SERVICE_ROLE_KEY (Vercel env) so rows and client phones are readable under RLS.';

-- Widen status check on existing DBs (idempotent if already includes failed)
alter table public.client_scheduled_reminders
  drop constraint if exists client_scheduled_reminders_status_check;

alter table public.client_scheduled_reminders
  add constraint client_scheduled_reminders_status_check
  check (status in ('pending', 'sent', 'cancelled', 'failed'));


-- >>>>>>>>>>>>>>>>>> END: add_client_reminders_hybrid.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_client_lead_source.sql <<<<<<<<<<<<<<<<<<
-- Run in Supabase SQL Editor: מקור ליד ללקוח (סינון הכנסות + טופסים).
alter table public.clients
  add column if not exists lead_source text;

comment on column public.clients.lead_source is
  'מקור הליד: פייסבוק, גוגל, המלצה, אורגני, טיקטוק, אחר';


-- >>>>>>>>>>>>>>>>>> END: add_client_lead_source.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_client_lead_provider_name.sql <<<<<<<<<<<<<<<<<<
-- Lead provider / contact name for CRM and revenue filtering.
-- Run in Supabase SQL Editor if the column is missing.

alter table public.clients
  add column if not exists lead_provider_name text;

comment on column public.clients.lead_provider_name is
  'שם הספק / איש קשר — free text alongside lead_source.';


-- >>>>>>>>>>>>>>>>>> END: add_client_lead_provider_name.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_lead_providers.sql <<<<<<<<<<<<<<<<<<
-- הרצה ב-Supabase SQL Editor: טבלת ספקי לידים לניהול בהגדרות, קישור ללקוחות ועמלות בדשבורד הכנסות.

create table if not exists public.lead_providers (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  phone text,
  commission_percent numeric(6, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint lead_providers_name_nonempty check (length(trim(name)) > 0),
  constraint lead_providers_commission_range
    check (commission_percent >= 0 and commission_percent <= 100)
);

create unique index if not exists lead_providers_name_unique
  on public.lead_providers (name);

comment on table public.lead_providers is
  'ספקי לידים — שם (נשמר ב־clients.lead_provider_name), טלפון, אחוז עמלה.';

alter table public.lead_providers enable row level security;

drop policy if exists "lead_providers_allow_all_anon" on public.lead_providers;
create policy "lead_providers_allow_all_anon"
  on public.lead_providers
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "lead_providers_allow_all_authenticated" on public.lead_providers;
create policy "lead_providers_allow_all_authenticated"
  on public.lead_providers
  for all
  to authenticated
  using (true)
  with check (true);


-- >>>>>>>>>>>>>>>>>> END: add_lead_providers.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_client_total_amount_payment_status.sql <<<<<<<<<<<<<<<<<<
-- Run in Supabase SQL Editor if these columns are missing.
-- Admin client detail saves סכום כולל / פירוט תשלום here; פורטל הלקוח לא מציג אותם.

alter table public.clients
  add column if not exists total_amount numeric(12, 2);

alter table public.clients
  add column if not exists payment_status text;

comment on column public.clients.total_amount is 'סכום כולל (שכר טרחה) — ניהול משרד';
comment on column public.clients.payment_status is 'פירוט תשלום / יתרה (לפני ואחרי) — ניהול משרד';


-- >>>>>>>>>>>>>>>>>> END: add_client_total_amount_payment_status.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_payments_table.sql <<<<<<<<<<<<<<<<<<
-- Payments per client (admin finance). Run in Supabase SQL Editor.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null,
  method text not null default '',
  description text,
  created_at timestamptz not null default now()
);

create index if not exists payments_client_id_idx on public.payments (client_id);

comment on table public.payments is 'תשלומי לקוח — פירוט לניהול משרד';
comment on column public.payments.amount is 'סכום בשקלים';
comment on column public.payments.paid_on is 'תאריך התשלום';
comment on column public.payments.method is 'אמצעי תשלום (מזומן, אשראי, העברה וכו׳)';

alter table public.payments enable row level security;

drop policy if exists "payments_allow_all_anon" on public.payments;
drop policy if exists "payments_allow_all_authenticated" on public.payments;

create policy "payments_allow_all_anon"
  on public.payments
  for all
  to anon
  using (true)
  with check (true);

create policy "payments_allow_all_authenticated"
  on public.payments
  for all
  to authenticated
  using (true)
  with check (true);


-- >>>>>>>>>>>>>>>>>> END: add_payments_table.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_closed_by_and_rep_commission.sql <<<<<<<<<<<<<<<<<<
-- Run in Supabase SQL Editor: closer tracking on clients + sales rep commission on profiles.

alter table public.profiles
  add column if not exists commission_percentage numeric(6, 2) not null default 0;

alter table public.profiles
  drop constraint if exists profiles_commission_percentage_range;

alter table public.profiles
  add constraint profiles_commission_percentage_range
  check (commission_percentage >= 0 and commission_percentage <= 100);

comment on column public.profiles.commission_percentage is
  'Sales rep commission rate (0–100) for revenue attribution when client.closed_by points to this profile.';

alter table public.clients
  add column if not exists closed_by uuid references public.profiles (id) on delete set null;

create index if not exists clients_closed_by_idx on public.clients (closed_by);

comment on column public.clients.closed_by is
  'Profile (team member) who closed the deal; used for commission on payments.';


-- >>>>>>>>>>>>>>>>>> END: add_closed_by_and_rep_commission.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_upload_request_active.sql <<<<<<<<<<<<<<<<<<
-- Supabase SQL Editor: שלב העלאת מסמכים בפורטל — נפתח רק כשהמנהל מפעיל.
alter table public.clients
  add column if not exists upload_request_active boolean not null default false;

comment on column public.clients.upload_request_active is
  'כאשר false — רשימת העלאת מסמכים מוסתרת בפורטל עד שהמנהל שולח דרישה (ו-WhatsApp).';


-- >>>>>>>>>>>>>>>>>> END: add_upload_request_active.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_agreement_from_document.sql <<<<<<<<<<<<<<<<<<
-- Link digital signature to a specific row in public.documents (PDF in documents-uploads).
-- Run in Supabase SQL Editor.

alter table public.clients
  add column if not exists agreement_document_id uuid references public.documents (id) on delete set null;

comment on column public.clients.agreement_document_id is
  'When agreement_source = from_document, the PDF to sign (storage in documents-uploads).';

alter table public.clients
  drop constraint if exists clients_agreement_source_check;

alter table public.clients
  add constraint clients_agreement_source_check
  check (
    agreement_source is null
    or agreement_source in ('template', 'custom_pdf', 'from_document')
  );


-- >>>>>>>>>>>>>>>>>> END: add_agreement_from_document.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_agreement_template_selection.sql <<<<<<<<<<<<<<<<<<
-- Per-client template choice for portal DOCX agreement step (single or sequential multi-template).
-- Run in Supabase SQL Editor after deployment if these columns are missing.

alter table public.clients
  add column if not exists agreement_template_ids uuid[] not null default '{}';

alter table public.clients
  add column if not exists agreement_template_sign_index integer not null default 0;

comment on column public.clients.agreement_template_ids is
  'Ordered template UUIDs from public.templates; empty = legacy "latest active template".';

comment on column public.clients.agreement_template_sign_index is
  '0-based index into agreement_template_ids for the next template signature step.';


-- >>>>>>>>>>>>>>>>>> END: add_agreement_template_selection.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_agreement_structure_templates.sql <<<<<<<<<<<<<<<<<<
-- Agreement form templates: structured grid of CRM custom fields for portal + PDF.
-- Run in Supabase SQL Editor. Requires public.custom_field_definitions.

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


-- >>>>>>>>>>>>>>>>>> END: add_agreement_structure_templates.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_documents_storage_path.sql <<<<<<<<<<<<<<<<<<
-- Run once in Supabase SQL Editor if `documents.storage_path` is missing.
-- Needed for signed view links when the uploads bucket is private.

alter table public.documents
  add column if not exists storage_path text;

comment on column public.documents.storage_path is
  'Object path inside bucket documents-uploads (e.g. clientId/uuid/file.pdf).';


-- >>>>>>>>>>>>>>>>>> END: add_documents_storage_path.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_documents_needs_signature.sql <<<<<<<<<<<<<<<<<<
-- Run in Supabase SQL Editor.
-- Multi-document portal signatures: mark rows in `documents` with needs_signature;
-- per-document signed state on the same row.

alter table public.documents
  add column if not exists needs_signature boolean not null default false;

alter table public.documents
  add column if not exists signature_signed_at timestamptz;

alter table public.documents
  add column if not exists signed_pdf_storage_path text;

comment on column public.documents.needs_signature is
  'When true, client portal includes this upload in the signature queue (PDF).';

comment on column public.documents.signature_signed_at is
  'Set when the client finished signing this document in the portal.';

comment on column public.documents.signed_pdf_storage_path is
  'Path in documents-signed bucket for the merged signed PDF for this row.';

-- Optional second step after all needs_signature docs: template DOCX or custom PDF from client row.
alter table public.clients
  add column if not exists agreement_aux_signed_at timestamptz;

comment on column public.clients.agreement_aux_signed_at is
  'When agreement_source is template or custom_pdf, set when that non-upload step is signed (after document queue if any).';

-- Backfill: existing single-document flow
update public.documents d
set needs_signature = true
from public.clients c
where
  c.agreement_document_id is not null
  and d.id = c.agreement_document_id
  and d.client_id = c.id
  and coalesce(d.needs_signature, false) = false;

-- Completed legacy clients: avoid forcing an extra "aux" template step
update public.clients
set agreement_aux_signed_at = coalesce(agreement_aux_signed_at, signed_at)
where
  has_signed = true
  and agreement_aux_signed_at is null;


-- >>>>>>>>>>>>>>>>>> END: add_documents_needs_signature.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_documents_portal_signed_columns.sql <<<<<<<<<<<<<<<<<<
-- Optional metadata for portal-signed PDF rows (run in Supabase SQL Editor).
-- Lets the admin UI show a clear label and filter by document_type.

alter table public.documents
  add column if not exists name text;

alter table public.documents
  add column if not exists document_type text;

alter table public.documents
  add column if not exists is_active boolean not null default true;

comment on column public.documents.name is
  'Display label for the row (e.g. Hebrew title with timestamp).';

comment on column public.documents.document_type is
  'Category, e.g. Signed Agreement for portal-generated signed PDFs.';

comment on column public.documents.is_active is
  'Soft visibility; portal inserts set true.';


-- >>>>>>>>>>>>>>>>>> END: add_documents_portal_signed_columns.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: add_signature_templates.sql <<<<<<<<<<<<<<<<<<
-- Parallel "structured signature" templates (safety-first). Does not modify Word `templates` or portal APIs.
-- Run in Supabase SQL Editor. Requires public.custom_field_definitions.

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


-- >>>>>>>>>>>>>>>>>> END: add_signature_templates.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: clients_signature_template_fkey_on_delete_set_null.sql <<<<<<<<<<<<<<<<<<
-- קשר גמיש: מחיקת תבנית חתימה לא חוסמת — מנקה את ההפניה אצל הלקוח.
-- הרצה ב-Supabase SQL Editor אם ה-FK הקיים הוגדר ללא ON DELETE SET NULL.

alter table public.clients
  drop constraint if exists clients_signature_template_id_fkey,
  add constraint clients_signature_template_id_fkey
    foreign key (signature_template_id)
    references public.signature_templates (id)
    on delete set null;


-- >>>>>>>>>>>>>>>>>> END: clients_signature_template_fkey_on_delete_set_null.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: client_agreement_request.sql <<<<<<<<<<<<<<<<<<
-- הרצה ב-Supabase SQL Editor: בקשת חתימה לפי לקוח (תבנית פעילה או PDF ייעודי).

alter table public.clients
  add column if not exists agreement_request_active boolean not null default true;

alter table public.clients
  add column if not exists agreement_source text;

alter table public.clients
  drop constraint if exists clients_agreement_source_check;

alter table public.clients
  add constraint clients_agreement_source_check
  check (
    agreement_source is null
    or agreement_source in ('template', 'custom_pdf', 'from_document')
  );

alter table public.clients
  add column if not exists agreement_document_id uuid references public.documents (id) on delete set null;

alter table public.clients
  add column if not exists agreement_custom_pdf_path text;

alter table public.clients
  add column if not exists agreement_custom_pdf_filename text;

comment on column public.clients.agreement_request_active is
  'כבוי = אין בקשת חתימה בפורטל עד שהמנהל מפעיל. דולחים קיימים נשארים true (ברירת מחדל בעמודה).';

comment on column public.clients.agreement_source is
  'template = תבנית docx הפעילה הגלובלית; custom_pdf = קובץ PDF ייעודי ב-Storage. null + active = התנהגות ישנה (תבנית גלובלית).';

insert into storage.buckets (id, name, public)
values ('client-agreements', 'client-agreements', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "client_agreements_anon_all" on storage.objects;
drop policy if exists "client_agreements_authenticated_all" on storage.objects;

create policy "client_agreements_anon_all"
  on storage.objects
  for all
  to anon
  using (bucket_id = 'client-agreements')
  with check (bucket_id = 'client-agreements');

create policy "client_agreements_authenticated_all"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'client-agreements')
  with check (bucket_id = 'client-agreements');


-- >>>>>>>>>>>>>>>>>> END: client_agreement_request.sql

-- >>>>>>>>>>>>>>>>>> BEGIN: setup_dynamic_docs.sql <<<<<<<<<<<<<<<<<<
-- Dynamic document types (managed from Admin). Run once in Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.document_types (
  id uuid primary key default gen_random_uuid (),
  name text not null unique,
  download_link text,
  blank_form_original_filename text,
  created_at timestamptz not null default now()
);

alter table public.document_types
  add column if not exists blank_form_original_filename text;

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

insert into public.document_types (name, download_link)
values
  ('צילום תעודת זהות וספח', null),
  (
    'הצהרת בריאות',
    'https://www.gov.il/BlobFolder/service/firearm-license-health-declaration/he/firearm-license-health-declaration.pdf'
  ),
  ('אישור שירות צבאי/לאומי', null),
  ('תלושי שכר / אישור רואה חשבון', null)
on conflict (name) do update
set
  download_link = excluded.download_link;

-- טפסים ריקים לסוגי מסמכים (ממשק ניהול) נשמרים ב-Storage באקט׳ בשם templates.
-- ב-Supabase: Storage → New bucket → שם: templates → Public (לקבלת getPublicUrl).
-- יש להגדיר מדיניות RLS על storage.objects לאפשר INSERT (ועיון) למפתח ה-anon בשימוש באפליקציה.


-- >>>>>>>>>>>>>>>>>> END: setup_dynamic_docs.sql

