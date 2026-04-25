-- Link digital signature to a specific row in public.documents (PDF in documents-uploads).
-- Run in Supabase SQL Editor.

alter table public.clients
  add column if not exists agreement_document_id uuid references public.documents (id) on delete set null;

comment on column public.clients.agreement_document_id is
  'When agreement_source = from_document, the PDF to sign (storage in documents-uploads).';

alter table public.clients
  drop constraint if exists clients_agreement_source_check;

alter table public.clients
  add constraint clients_agreement_source_check
  check (
    agreement_source is null
    or agreement_source in ('template', 'custom_pdf', 'from_document')
  );
