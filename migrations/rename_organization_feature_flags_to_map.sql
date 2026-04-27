-- Rename legacy organization_feature_flags → organization_feature_map (idempotent)
do $$
begin
  if to_regclass ('public.organization_feature_flags') is not null
  and to_regclass ('public.organization_feature_map') is null then
    alter table public.organization_feature_flags
      rename to organization_feature_map;

    if to_regclass ('public.organization_feature_flags_org_idx') is not null then
      alter index public.organization_feature_flags_org_idx
        rename to organization_feature_map_org_idx;
    end if;

    if exists (
      select
        1
      from pg_constraint
      where
        conname = 'organization_feature_flags_org_feature_key'
    ) then
      alter table public.organization_feature_map
        rename constraint organization_feature_flags_org_feature_key to organization_feature_map_org_feature_key;
    end if;
  end if;
end
$$;

drop policy if exists "feature_flags_read_tenant" on public.organization_feature_map;
drop policy if exists "feature_flags_write_super" on public.organization_feature_map;

create policy "feature_map_read_tenant"
  on public.organization_feature_map
  for select
  to authenticated
  using (public.auth_is_platform_super () or organization_id = public.auth_user_org_id ());

create policy "feature_map_write_super"
  on public.organization_feature_map
  for all
  to authenticated
  using (public.auth_is_platform_super ())
  with check (public.auth_is_platform_super ());

comment on table public.organization_feature_map is
  'Per-org feature on/off. Absent row = enabled. Row with enabled=false = off.';

insert into public.system_features (code, label, description, sort_order)
values
  ('lead_providers', 'ספקי לידים', 'ניהול ספקי לידים & קישורי הכנסות', 45)
on conflict (code) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;

notify pgrst, 'reload schema';
