-- Run in Supabase SQL Editor.
-- Multi-document portal signatures: mark rows in `documents` with needs_signature;
-- per-document signed state on the same row.

alter table public.documents
  add column if not exists needs_signature boolean not null default false;

alter table public.documents
  add column if not exists signature_signed_at timestamptz;

alter table public.documents
  add column if not exists signed_pdf_storage_path text;

comment on column public.documents.needs_signature is
  'When true, client portal includes this upload in the signature queue (PDF).';

comment on column public.documents.signature_signed_at is
  'Set when the client finished signing this document in the portal.';

comment on column public.documents.signed_pdf_storage_path is
  'Path in documents-signed bucket for the merged signed PDF for this row.';

-- Optional second step after all needs_signature docs: template DOCX or custom PDF from client row.
alter table public.clients
  add column if not exists agreement_aux_signed_at timestamptz;

comment on column public.clients.agreement_aux_signed_at is
  'When agreement_source is template or custom_pdf, set when that non-upload step is signed (after document queue if any).';

-- Backfill: existing single-document flow
update public.documents d
set needs_signature = true
from public.clients c
where
  c.agreement_document_id is not null
  and d.id = c.agreement_document_id
  and d.client_id = c.id
  and coalesce(d.needs_signature, false) = false;

-- Completed legacy clients: avoid forcing an extra "aux" template step
update public.clients
set agreement_aux_signed_at = coalesce(agreement_aux_signed_at, signed_at)
where
  has_signed = true
  and agreement_aux_signed_at is null;
