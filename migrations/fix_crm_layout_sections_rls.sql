-- Fix: "new row violates row-level security policy for table crm_layout_sections"
-- Occurs when RLS is ON but insert/update policies are missing or only SELECT exists.
-- Safe to re-run: drops the known open policies and recreates them.
-- See also: add_crm_layout_sections.sql, PASTE_02_LAYOUT.sql

alter table if exists public.crm_layout_sections enable row level security;

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

grant select, insert, update, delete on public.crm_layout_sections to authenticated;
grant select, insert, update, delete on public.crm_layout_sections to anon;
grant all on public.crm_layout_sections to service_role;
