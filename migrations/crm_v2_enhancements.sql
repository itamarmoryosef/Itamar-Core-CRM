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
