-- =============================================================================
-- הדבקה ב־Supabase → SQL (אחרי PASTE_01_CORE + PASTE_02/3 לפי הצורך)
-- + הרצת migrations/add_multi_tenancy_organizations.sql אם משתמשים ב־super/ארגונים
-- + תבניות הודעות (SMS / WhatsApp): migrations/add_outbound_message_templates.sql
-- + תשלומים (דף הכנסות / `payments.paid_on`): migrations/add_payments_table.sql
-- =============================================================================

-- 1) client_statuses.is_active (למסכי סטטוסים + פילטרים)
alter table public.client_statuses
  add column if not exists is_active boolean not null default true;

comment on column public.client_statuses.is_active is
  'When false, hidden from new selections / some lists.';

-- 2) אדמין ארגוני; אם קיימת is_platform_super — גם super בפלטפורמה
--    הרץ `migrations/add_multi_tenancy_organizations.sql` אם רוצה מסלול super + ארגונים

do $promote$
begin
  if exists (
    select 1
    from information_schema.columns
    where
      table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'is_platform_super'
  ) then
    update public.profiles p
    set
      role = 'admin',
      is_platform_super = true
    from auth.users u
    where
      p.id = u.id
      and lower(trim(u.email)) = lower(trim('i0503781924@gmail.com'));
  else
    update public.profiles p
    set role = 'admin'
    from auth.users u
    where
      p.id = u.id
      and lower(trim(u.email)) = lower(trim('i0503781924@gmail.com'));
  end if;
end
$promote$;

-- בדיקה (אם יש is_platform_super):
-- select p.id, u.email, p.role, p.is_platform_super, p.organization_id
-- from public.profiles p join auth.users u on u.id = p.id
-- where lower(u.email) = lower('i0503781924@gmail.com');
