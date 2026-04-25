-- Dynamic CRM client statuses (Yoatzim-style). Run in Supabase SQL Editor after backups.
-- Adds client_statuses, clients.status_id, sync triggers, seeds existing Hebrew labels.

create table if not exists public.client_statuses (
  id uuid primary key default gen_random_uuid (),
  label text not null unique,
  color_hex text not null default '#64748b',
  sort_order int not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now (),
  constraint client_statuses_color_hex_check check (
    color_hex ~ '^#[0-9A-Fa-f]{6}$'
  )
);

alter table public.client_statuses enable row level security;

drop policy if exists "client_statuses_allow_all_anon" on public.client_statuses;
drop policy if exists "client_statuses_allow_all_authenticated" on public.client_statuses;

create policy "client_statuses_allow_all_anon"
  on public.client_statuses
  for all
  to anon
  using (true)
  with check (true);

create policy "client_statuses_allow_all_authenticated"
  on public.client_statuses
  for all
  to authenticated
  using (true)
  with check (true);

-- Seed: core pipeline + portal/cron semantics (system). Extra CRM labels for Yoatzim-style workflows.
insert into public.client_statuses (label, color_hex, sort_order, is_system)
values
  ('ממתין למסמכים', '#0ea5e9', 0, true),
  ('מסמכים הושלמו', '#8b5cf6', 1, true),
  ('הוגש - ממתין לתשובה', '#f59e0b', 2, true),
  ('הסתיים - טופל בהצלחה', '#22c55e', 3, true),
  ('הסתיים - לא קיבל רישיון', '#ef4444', 4, true),
  ('ממתין לחתימה', '#6366f1', 5, true),
  ('חדש', '#14b8a6', 10, false),
  ('בטיפול', '#a855f7', 11, false),
  ('הושלם', '#84cc16', 12, false)
on conflict (label) do nothing;

alter table public.clients
  add column if not exists status_id uuid references public.client_statuses (id) on delete restrict;

update public.clients c
set
  status_id = s.id
from
  public.client_statuses s
where
  c.status_id is null
  and trim(coalesce(c.status, '')) = trim(s.label);

update public.clients c
set
  status_id = d.id
from
  public.client_statuses d
where
  c.status_id is null
  and d.label = 'ממתין למסמכים';

-- Fail loudly if any row still lacks status_id (unexpected status text).
do $$
begin
  if exists (
    select
      1
    from
      public.clients
    where
      status_id is null
  ) then
    raise exception 'clients.status_id backfill incomplete: add client_statuses rows for orphan labels or fix clients.status';
  end if;
end
$$;

alter table public.clients
  alter column status_id set not null;

create or replace function public.clients_apply_status_sync ()
returns trigger
language plpgsql
as $$
declare
  v_label text;
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.status_id is not null then
      select
        s.label into v_label
      from
        public.client_statuses s
      where
        s.id = new.status_id;
      if v_label is null then
        raise exception 'clients: invalid status_id %', new.status_id;
      end if;
      new.status := v_label;
    elsif new.status is not null and btrim (coalesce(new.status, '')) <> '' then
      select
        s.id into v_id
      from
        public.client_statuses s
      where
        trim(s.label) = trim(new.status)
      limit
        1;
      if v_id is null then
        raise exception 'clients: unknown status label %', new.status;
      end if;
      new.status_id := v_id;
    else
      select
        s.id,
        s.label into new.status_id,
        new.status
      from
        public.client_statuses s
      where
        s.label = 'ממתין למסמכים'
      limit
        1;
      if new.status_id is null then
        raise exception 'clients: default status row missing';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status_id is distinct from old.status_id and new.status_id is not null then
    select
      s.label into v_label
    from
      public.client_statuses s
    where
      s.id = new.status_id;
    if v_label is null then
      raise exception 'clients: invalid status_id %', new.status_id;
    end if;
    new.status := v_label;
  elsif new.status is distinct from old.status
  and new.status is not null
  and btrim (coalesce(new.status, '')) <> '' then
    select
      s.id into v_id
    from
      public.client_statuses s
    where
      trim(s.label) = trim(new.status)
    limit
      1;
    if v_id is null then
      raise exception 'clients: unknown status label %', new.status;
    end if;
    new.status_id := v_id;
  end if;

  return new;
end;
$$;

drop trigger if exists clients_apply_status_sync_trigger on public.clients;

create trigger clients_apply_status_sync_trigger
before insert or update on public.clients
for each row
execute function public.clients_apply_status_sync ();

create or replace function public.client_statuses_after_label_update ()
returns trigger
language plpgsql
as $$
begin
  if new.label is distinct from old.label then
    update public.clients
    set
      status = new.label
    where
      status_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists client_statuses_propagate_label on public.client_statuses;

create trigger client_statuses_propagate_label
after update of label on public.client_statuses
for each row
execute function public.client_statuses_after_label_update ();
