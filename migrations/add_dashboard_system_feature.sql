-- Register dashboard feature for /admin/dashboard gating.
insert into public.system_features (code, label, description, sort_order)
values
  ('dashboard', 'דשבורד', 'לוח בקרה /admin/dashboard', 5)
on conflict (code) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;
