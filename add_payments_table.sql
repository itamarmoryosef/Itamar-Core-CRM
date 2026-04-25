-- Payments per client (admin finance). Run in Supabase SQL Editor.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null,
  method text not null default '',
  description text,
  created_at timestamptz not null default now()
);

create index if not exists payments_client_id_idx on public.payments (client_id);

comment on table public.payments is 'תשלומי לקוח — פירוט לניהול משרד';
comment on column public.payments.amount is 'סכום בשקלים';
comment on column public.payments.paid_on is 'תאריך התשלום';
comment on column public.payments.method is 'אמצעי תשלום (מזומן, אשראי, העברה וכו׳)';

alter table public.payments enable row level security;

drop policy if exists "payments_allow_all_anon" on public.payments;
drop policy if exists "payments_allow_all_authenticated" on public.payments;

create policy "payments_allow_all_anon"
  on public.payments
  for all
  to anon
  using (true)
  with check (true);

create policy "payments_allow_all_authenticated"
  on public.payments
  for all
  to authenticated
  using (true)
  with check (true);
