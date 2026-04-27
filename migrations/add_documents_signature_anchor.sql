-- Optional rectangle (normalized to page) where portal signature is drawn on the PDF.
-- When NULL, behavior stays: append signature appendix page (existing merge).

alter table public.documents
  add column if not exists signature_anchor jsonb;

comment on column public.documents.signature_anchor is
  'Portal PDF merge: { "pageIndex": 0, "rect": { "x","y","w","h" } } — top-left normalized 0..1 on page; omit or null = legacy appendix page.';
