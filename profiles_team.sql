-- אופציונלי: טבלת profiles מסונכרנת עם auth.users (לתצוגה / תפקידים בעתיד).
-- הרצה ב-Supabase SQL Editor. אפליקציית ניהול הצוות משתמשת ב-Auth Admin API לרשימה.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'staff',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- MVP: התאימו למדיניות האבטחה שלכם (למשל רק authenticated).
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);

comment on table public.profiles is
  'Team & roles: role admin = ניהול צוות באפליקציה; staff = משתמש רגיל.';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'staff'));

-- מנהל ראשון: לאחר התחברות ראשונה, החליפו UUID ואימייל (Authentication → Users):
-- insert into public.profiles (id, email, role)
-- values ('00000000-0000-0000-0000-000000000000', 'admin@example.com', 'admin')
-- on conflict (id) do update set role = 'admin', email = excluded.email;

-- סנכרון אוטומטי כשנרשם משתמש חדש ב-Auth:
create or replace function public.handle_new_auth_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'staff')
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user ();
