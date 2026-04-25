-- Supabase SQL Editor: שלב העלאת מסמכים בפורטל — נפתח רק כשהמנהל מפעיל.
alter table public.clients
  add column if not exists upload_request_active boolean not null default false;

comment on column public.clients.upload_request_active is
  'כאשר false — רשימת העלאת מסמכים מוסתרת בפורטל עד שהמנהל שולח דרישה (ו-WhatsApp).';
