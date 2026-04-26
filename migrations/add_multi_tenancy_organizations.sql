-- Multi-tenancy: organizations + organization_id. Run in Supabase SQL Editor. Idempotent where possible.
-- See comments at end for anon/portal and platform super.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1) organizations
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  slug text not null,
  branding_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now (),
  constraint organizations_name_nonempty check (length(trim(name)) > 0),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' and length(slug) between 2 and 64)
);

create unique index if not exists organizations_slug_key on public.organizations (lower(slug));

comment on table public.organizations is 'SaaS tenants; RLS: authenticated org users see own org; platform super sees all.';
comment on column public.organizations.branding_settings is 'JSON: name, tagline, colors, logo (optional)';

alter table public.organizations enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Default org + backfill
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, slug, branding_settings)
select
  gen_random_uuid (),
  'Alentix Default',
  'default',
  '{}'::jsonb
where
  not exists (select 1 from public.organizations);

-- ---------------------------------------------------------------------------
-- 3) profiles: organization + platform super
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.profiles
  add column if not exists is_platform_super boolean not null default false;

-- Backfill: assign everyone to first org
update public.profiles p
set
  organization_id = (
    select o.id from public.organizations o order by o.created_at asc limit 1
  )
where
  p.organization_id is null;

-- ---------------------------------------------------------------------------
-- 4) Tenant columns on data tables
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade;

update public.clients c
set
  organization_id = (
    select o.id from public.organizations o order by o.created_at asc limit 1
  )
where
  c.organization_id is null;

create index if not exists clients_organization_id_idx on public.clients (organization_id);

alter table public.custom_field_sections
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade;

update public.custom_field_sections s
set
  organization_id = (select o.id from public.organizations o order by o.created_at asc limit 1)
where
  s.organization_id is null;

create index if not exists custom_field_sections_organization_id_idx
  on public.custom_field_sections (organization_id);

alter table public.custom_field_definitions
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade;

-- formula for calculation fields (PASTE_03; safe if already exists)
alter table public.custom_field_definitions
  add column if not exists formula text;

update public.custom_field_definitions d
set
  organization_id = (select o.id from public.organizations o order by o.created_at asc limit 1)
where
  d.organization_id is null;

create index if not exists custom_field_definitions_organization_id_idx
  on public.custom_field_definitions (organization_id);

-- Slug unique per-tenant (was global unique(slug) in older DBs)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where
      conname = 'custom_field_definitions_slug_key'
      and conrelid = 'public.custom_field_definitions'::regclass
  ) then
    alter table public.custom_field_definitions
      drop constraint custom_field_definitions_slug_key;
  end if;
end $$;
drop index if exists custom_field_definitions_slug_key;
create unique index if not exists custom_field_definitions_org_slug_uq
  on public.custom_field_definitions (organization_id, (lower(slug)));

-- Widen field_type to include calculation if constraint exists
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'custom_field_definitions' and constraint_name = 'custom_field_definitions_field_type_check'
  ) then
    alter table public.custom_field_definitions
      drop constraint if exists custom_field_definitions_field_type_check;
  end if;
  if exists (select 1 from information_schema.tables t where t.table_name = 'custom_field_definitions' and t.table_schema = 'public') then
    update public.custom_field_definitions
    set
      field_type = 'text'
    where
      field_type is null
      or field_type = ''
      or field_type not in ('text', 'number', 'date', 'select', 'calculation');
    alter table public.custom_field_definitions
      add constraint custom_field_definitions_field_type_check
        check (field_type in ('text', 'number', 'date', 'select', 'calculation'));
  end if;
end $$;

comment on column public.custom_field_definitions.formula is 'For calculation: expression with {{slug}} placeholders.';

-- lead_providers org scope
alter table public.lead_providers
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade;
update public.lead_providers p
set
  organization_id = (select o.id from public.organizations o order by o.created_at asc limit 1)
where
  p.organization_id is null;
create index if not exists lead_providers_organization_id_idx on public.lead_providers (organization_id);

-- ---------------------------------------------------------------------------
-- 5) Helper functions (STABLE; SECURITY DEFINER reads profiles)
-- ---------------------------------------------------------------------------
create or replace function public.auth_user_org_id ()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id from public.profiles p where p.id = auth.uid ();
$$;

create or replace function public.auth_is_platform_super ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_platform_super
    from public.profiles p
    where
      p.id = auth.uid ()
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- 6) RLS: organizations
-- ---------------------------------------------------------------------------
drop policy if exists "organizations_read_tenant" on public.organizations;
create policy "organizations_read_tenant"
  on public.organizations
  for select
  to authenticated
  using (public.auth_is_platform_super () or id = public.auth_user_org_id ());

drop policy if exists "organizations_write_platform_super" on public.organizations;
create policy "organizations_write_platform_super"
  on public.organizations
  for all
  to authenticated
  using (public.auth_is_platform_super ())
  with check (public.auth_is_platform_super ());

-- ---------------------------------------------------------------------------
-- 7) RLS: clients — replace broad authenticated policies (keep anon for portal; admin uses auth)
-- ---------------------------------------------------------------------------
drop policy if exists "clients_allow_all_authenticated" on public.clients;
drop policy if exists "clients_tenant" on public.clients;
create policy "clients_tenant"
  on public.clients
  for all
  to authenticated
  using (public.auth_is_platform_super () or organization_id = public.auth_user_org_id ())
  with check (public.auth_is_platform_super () or organization_id = public.auth_user_org_id ());

-- ---------------------------------------------------------------------------
-- 8) RLS: custom_field_sections, custom_field_definitions, lead_providers
-- ---------------------------------------------------------------------------
drop policy if exists "custom_field_sections_allow_all_authenticated" on public.custom_field_sections;
create policy "custom_field_sections_tenant"
  on public.custom_field_sections
  for all
  to authenticated
  using (public.auth_is_platform_super () or organization_id = public.auth_user_org_id ())
  with check (public.auth_is_platform_super () or organization_id = public.auth_user_org_id ());

drop policy if exists "custom_field_definitions_allow_all_authenticated" on public.custom_field_definitions;
create policy "custom_field_definitions_tenant"
  on public.custom_field_definitions
  for all
  to authenticated
  using (public.auth_is_platform_super () or organization_id = public.auth_user_org_id ())
  with check (public.auth_is_platform_super () or organization_id = public.auth_user_org_id ());

drop policy if exists "lead_providers_allow_all_authenticated" on public.lead_providers;
create policy "lead_providers_tenant"
  on public.lead_providers
  for all
  to authenticated
  using (public.auth_is_platform_super () or organization_id = public.auth_user_org_id ())
  with check (public.auth_is_platform_super () or organization_id = public.auth_user_org_id ());

-- ---------------------------------------------------------------------------
-- 9) profiles: tighten select — same org or self; super sees all
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_tenant"
  on public.profiles
  for select
  to authenticated
  using (public.auth_is_platform_super () or id = auth.uid () or organization_id = public.auth_user_org_id ());

-- Allow users to update own full_name etc.; org assignment only via service/super
drop policy if exists "profiles_update_platform_super" on public.profiles;
create policy "profiles_update_platform_super"
  on public.profiles
  for all
  to authenticated
  using (public.auth_is_platform_super ())
  with check (public.auth_is_platform_super ());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid () or public.auth_is_platform_super ())
  with check (
    public.auth_is_platform_super ()
    or (
      id = auth.uid ()
      and organization_id is not distinct from (
        select p.organization_id from public.profiles p where p.id = auth.uid ()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 10) Trigger: new user gets first org
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o_id uuid;
begin
  select o.id into o_id from public.organizations o order by o.created_at asc limit 1;
  insert into public.profiles (id, email, role, organization_id)
  values (new.id, new.email, 'staff', o_id)
  on conflict (id) do update
  set
    email = excluded.email;
  return new;
end;
$$;

-- Anon/portal: existing anon policies on clients (open) remain for unauthenticated portal until you migrate
-- portal to authenticated or API-only reads.

-- Optional: require org on core rows (fails if any null remains)
-- alter table public.clients alter column organization_id set not null;
-- alter table public.custom_field_definitions alter column organization_id set not null;
-- alter table public.custom_field_sections alter column organization_id set not null;
-- alter table public.lead_providers alter column organization_id set not null;

comment on function public.auth_user_org_id is 'Current user org; null if unset.';
comment on function public.auth_is_platform_super is 'Cross-tenant admin; set manually: update profiles set is_platform_super = true where email = ...';
