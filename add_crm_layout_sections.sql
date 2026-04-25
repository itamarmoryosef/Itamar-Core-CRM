-- Modular CRM layout sections (card + designer). Run after custom_field_sections + crm_layout_slots exist.
-- Backfills from custom_field_sections (same ids), then repoints FKs.

create table if not exists public.crm_layout_sections (
  id uuid primary key default gen_random_uuid (),
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now ()
);

alter table public.crm_layout_sections enable row level security;

drop policy if exists "crm_layout_sections_allow_all_anon" on public.crm_layout_sections;
drop policy if exists "crm_layout_sections_allow_all_authenticated" on public.crm_layout_sections;

create policy "crm_layout_sections_allow_all_anon"
  on public.crm_layout_sections
  for all
  to anon
  using (true)
  with check (true);

create policy "crm_layout_sections_allow_all_authenticated"
  on public.crm_layout_sections
  for all
  to authenticated
  using (true)
  with check (true);

insert into public.crm_layout_sections (id, title, sort_order, created_at)
select id, title, sort_order, created_at
from public.custom_field_sections
on conflict (id) do nothing;

alter table public.crm_layout_slots
  drop constraint if exists crm_layout_slots_section_id_fkey;

alter table public.crm_layout_slots
  add constraint crm_layout_slots_section_id_fkey
  foreign key (section_id) references public.crm_layout_sections (id) on delete cascade;

alter table public.custom_field_definitions
  drop constraint if exists custom_field_definitions_section_id_fkey;

alter table public.custom_field_definitions
  add constraint custom_field_definitions_section_id_fkey
  foreign key (section_id) references public.crm_layout_sections (id) on delete set null;

comment on table public.crm_layout_sections is 'מודולי פריסה לכרטיס CRM (מעצב + לקוח)';
