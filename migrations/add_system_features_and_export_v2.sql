-- system_features + organization_feature_map + export_org_data_v2
-- Idempotent. Run in Supabase SQL after organizations exist.
-- אם export_org_data_v2 כבר קיימת אצלכם: מחקו/הערו את בלוק הפונקציה למטה (או התאימו signature).

-- ---------------------------------------------------------------------------
-- 1) Catalog
-- ---------------------------------------------------------------------------
create table if not exists public.system_features (
  id uuid primary key default gen_random_uuid (),
  code text not null,
  label text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now (),
  constraint system_features_code_key unique (code),
  constraint system_features_code_format check (code ~ '^[a-z][a-z0-9_]*$')
);

create index if not exists system_features_sort_idx on public.system_features (sort_order, code);

comment on table public.system_features is 'Global feature registry; per-org in organization_feature_map.';

-- ---------------------------------------------------------------------------
-- 2) Per-organization map (absent row = feature enabled by default)
-- ---------------------------------------------------------------------------
create table if not exists public.organization_feature_map (
  id uuid primary key default gen_random_uuid (),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  system_feature_id uuid not null references public.system_features (id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now (),
  constraint organization_feature_map_org_feature_key unique (organization_id, system_feature_id)
);

create index if not exists organization_feature_map_org_idx
  on public.organization_feature_map (organization_id);

comment on table public.organization_feature_map is 'When a row exists with enabled=false, the org cannot use that feature.';

-- ---------------------------------------------------------------------------
-- 3) Seed (nav + team)
-- ---------------------------------------------------------------------------
insert into public.system_features (code, label, description, sort_order)
values
  ('revenue', 'סיכום הכנסות', 'מסך /admin/revenue', 10),
  ('statuses', 'ניהול סטטוסים', 'הגדרות סטטוסי CRM', 20),
  ('custom_fields', 'שדות מותאמים', 'הגדרות שדות דינמיים', 30),
  ('settings', 'הגדרות ותצורה', 'הגדרות כלליות (ללא סטטוסים/שדות)', 40),
  ('team', 'ניהול צוות', 'הרשאות ומשתמשי צוות', 50),
  ('lead_providers', 'ספקי לידים', 'ניהול ספקי לידים & קישורי הכנסות', 45)
on conflict (code) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------------
alter table public.system_features enable row level security;
alter table public.organization_feature_map enable row level security;

drop policy if exists "system_features_select_all" on public.system_features;
create policy "system_features_select_all"
  on public.system_features
  for select
  to authenticated
  using (true);

drop policy if exists "feature_flags_read_tenant" on public.organization_feature_map;
drop policy if exists "feature_map_read_tenant" on public.organization_feature_map;
create policy "feature_map_read_tenant"
  on public.organization_feature_map
  for select
  to authenticated
  using (public.auth_is_platform_super () or organization_id = public.auth_user_org_id ());

drop policy if exists "feature_flags_write_super" on public.organization_feature_map;
drop policy if exists "feature_map_write_super" on public.organization_feature_map;
create policy "feature_map_write_super"
  on public.organization_feature_map
  for all
  to authenticated
  using (public.auth_is_platform_super ())
  with check (public.auth_is_platform_super ());

-- Service role bypasses RLS; app uses service role for admin API.

-- ---------------------------------------------------------------------------
-- 5) export_org_data_v2 — JSON snapshot (extend in DB for full export)
-- ---------------------------------------------------------------------------
create or replace function public.export_org_data_v2 (p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb;
  n_clients int;
begin
  if p_organization_id is null then
    return jsonb_build_object('error', 'p_organization_id required');
  end if;

  select to_jsonb (t) into o
  from public.organizations t
  where t.id = p_organization_id;

  if o is null then
    return jsonb_build_object('error', 'organization not found', 'p_organization_id', p_organization_id);
  end if;

  select count(*)::int into n_clients from public.clients c where c.organization_id = p_organization_id;

  return jsonb_build_object(
    'exported_at', to_jsonb (now()::timestamptz),
    'organization', o,
    'stats', jsonb_build_object('clients', n_clients)
  );
end
$$;

comment on function public.export_org_data_v2 (uuid) is
  'Platform export JSON for an org. Extend with more tables as needed.';

grant execute on function public.export_org_data_v2 (uuid) to service_role;
grant execute on function public.export_org_data_v2 (uuid) to authenticated;

notify pgrst, 'reload schema';
