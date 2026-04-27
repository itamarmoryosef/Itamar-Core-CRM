-- Payments per client (admin finance). Run in Supabase SQL Editor.
-- Idempotent: safe re-run. Adds missing columns if `payments` already existed (e.g. without `paid_on`).

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null,
  method text not null default '',
  description text,
  created_at timestamptz not null default now()
);

-- Table may have been created earlier with partial columns; `CREATE TABLE IF NOT EXISTS` is then a no-op.
alter table public.payments
  add column if not exists created_at timestamptz not null default now();

alter table public.payments
  add column if not exists paid_on date;

-- Backfill then enforce NOT NULL (if column was added as nullable)
do $bd$
begin
  if
    exists (
      select
        1
      from
        information_schema.columns
      where
        table_schema = 'public'
        and table_name = 'payments'
        and column_name = 'created_at'
    )
  then
    update public.payments
    set
      paid_on = (created_at at time zone 'UTC')::date
    where
      paid_on is null;
  end if;
end
$bd$;

update public.payments
set
  paid_on = (current_date)
where
  paid_on is null;

alter table public.payments
  alter column paid_on set not null;

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
