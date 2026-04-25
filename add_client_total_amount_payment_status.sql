-- Run in Supabase SQL Editor if these columns are missing.
-- Admin client detail saves סכום כולל / פירוט תשלום here; פורטל הלקוח לא מציג אותם.

alter table public.clients
  add column if not exists total_amount numeric(12, 2);

alter table public.clients
  add column if not exists payment_status text;

comment on column public.clients.total_amount is 'סכום כולל (שכר טרחה) — ניהול משרד';
comment on column public.clients.payment_status is 'פירוט תשלום / יתרה (לפני ואחרי) — ניהול משרד';
