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
