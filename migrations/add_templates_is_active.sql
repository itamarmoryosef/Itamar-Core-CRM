-- תיקון: "column templates.is_active does not exist"
-- הרצה ב-Supabase SQL Editor (אם `templates` נוצרה בלי העמודה)
alter table public.templates
  add column if not exists is_active boolean not null default true;

comment on column public.templates.is_active is
  'תבנית Word לפורטל: רשומה אחת פעילה (true); בחירה בהגדרות.';
