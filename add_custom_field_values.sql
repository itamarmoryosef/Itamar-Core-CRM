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
