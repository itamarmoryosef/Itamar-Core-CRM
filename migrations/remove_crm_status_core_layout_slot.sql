-- שדה ליבה "crm_status" הוסר ממעגל ה-UI: הסטטוס מנוהל דרך client_statuses (ניהול סטטוסים) ו-status_id.
-- מוחקים רשומות פריסה ישנות (אופציונלי — הרצה ב-Supabase).

delete from public.crm_layout_slots
where
  slot_kind = 'core'
  and lower(trim(core_key)) = 'crm_status';
