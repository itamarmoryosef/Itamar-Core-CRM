-- Run in Supabase SQL Editor: מקור ליד ללקוח (סינון הכנסות + טופסים).
alter table public.clients
  add column if not exists lead_source text;

comment on column public.clients.lead_source is
  'מקור הליד: פייסבוק, גוגל, המלצה, אורגני, טיקטוק, אחר';
