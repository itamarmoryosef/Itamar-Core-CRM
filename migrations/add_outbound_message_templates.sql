-- Per-organization saved SMS / WhatsApp message bodies + optional CRM status association.
-- Idempotent: safe to re-run in Supabase SQL.

create table if not exists public.outbound_message_templates (
  id uuid primary key default gen_random_uuid (),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  body text not null,
  channel text not null default 'whatsapp',
  associated_status_id uuid null references public.client_statuses (id) on delete set null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  source_preset_id text null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint outbound_message_templates_channel_check check (channel in ('whatsapp', 'sms', 'both'))
);

create index if not exists outbound_message_templates_org_order_idx
  on public.outbound_message_templates (organization_id, sort_order, created_at);

comment on table public.outbound_message_templates is 'Hebrew SMS/WA copy; placeholders like [שם] replaced when sending (see lib/mergeClientOutboundMessage).';
comment on column public.outbound_message_templates.associated_status_id is 'Optional CRM stage this template is meant for (labels / future automation).';

alter table public.outbound_message_templates enable row level security;

drop policy if exists "outbound_message_templates_allow_all_anon" on public.outbound_message_templates;
drop policy if exists "outbound_message_templates_allow_all_authenticated" on public.outbound_message_templates;

create policy "outbound_message_templates_allow_all_anon"
  on public.outbound_message_templates
  for all
  to anon
  using (true)
  with check (true);

create policy "outbound_message_templates_allow_all_authenticated"
  on public.outbound_message_templates
  for all
  to authenticated
  using (true)
  with check (true);
