-- הגדרות מערכת (מפתח/ערך). הרצה ב-Supabase SQL Editor.
-- RLS פעיל ללא מדיניות ל-anon/authenticated — קריאה/כתיבה דרך Next.js עם SUPABASE_SERVICE_ROLE_KEY בלבד.

create table if not exists public.settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

comment on table public.settings is
  'הגדרות כלליות. מפתחות: admin_notification_phone (וואטסאפ למנהל), grow_payment_base_url (קישור בסיס לחיוב Grow).';

insert into public.settings (key, value)
values ('admin_notification_phone', '')
on conflict (key) do nothing;

insert into public.settings (key, value)
values ('grow_payment_base_url', '')
on conflict (key) do nothing;
