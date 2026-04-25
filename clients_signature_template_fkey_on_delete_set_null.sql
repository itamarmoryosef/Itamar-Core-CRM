-- קשר גמיש: מחיקת תבנית חתימה לא חוסמת — מנקה את ההפניה אצל הלקוח.
-- הרצה ב-Supabase SQL Editor אם ה-FK הקיים הוגדר ללא ON DELETE SET NULL.

alter table public.clients
  drop constraint if exists clients_signature_template_id_fkey,
  add constraint clients_signature_template_id_fkey
    foreign key (signature_template_id)
    references public.signature_templates (id)
    on delete set null;
