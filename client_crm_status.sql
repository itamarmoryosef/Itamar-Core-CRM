-- CRM pipeline: add `status` to clients (run in Supabase SQL Editor).

alter table public.clients
  add column if not exists status text not null default 'ממתין למסמכים';

comment on column public.clients.status is
  'CRM pipeline: ממתין למסמכים | מסמכים הושלמו | הוגש - ממתין לתשובה | הסתיים - טופל בהצלחה | הסתיים - לא קיבל רישיון';

-- אם העמודה כבר הייתה קיימת בלי ברירת מחדל, עדכון שורות ריקות:
update public.clients
set status = 'ממתין למסמכים'
where status is null or trim(status) = '';
