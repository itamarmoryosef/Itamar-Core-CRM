-- Dynamic required documents per client (JSON array of doc_type keys)
-- Run in Supabase SQL Editor.

alter table public.clients
  add column if not exists required_docs jsonb not null default '[]'::jsonb;

alter table public.documents
  add column if not exists original_filename text;

alter table public.clients
  add column if not exists status text not null default 'ממתין למסמכים';

update public.clients
set status = 'ממתין למסמכים'
where status is null or trim(status) = '';

comment on column public.clients.required_docs is
  'Array of strings, e.g. ["id_card_copy","health_declaration"]. Empty [] uses app legacy default.';

-- templates.name: display label (NOT NULL in many projects; app sends it on upload)
alter table public.templates add column if not exists name text;

update public.templates
set
  name = coalesce(nullif(trim(original_filename), ''), 'תבנית הסכם פעילה.docx')
where
  name is null
  or trim(name) = '';

alter table public.templates
  alter column name set default 'תבנית הסכם פעילה.docx';

alter table public.templates
  alter column name set not null;
