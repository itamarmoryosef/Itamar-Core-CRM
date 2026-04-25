# סדר הרצת SQL ב־Supabase

**לא מצליחים לפתוח?** → `PASTE_START_HERE.md` או `OPEN_PASTE_FILES.txt` (נתיבים מלאים).

**איך:** Supabase → **SQL** → **New query** → הדבקה → **Run**.  
רוב הסקריפטים **אידמפוטנטיים** (אפשר להריץ שוב; עדיין עדיף לשמור גיבוי לפני DB פרודקשן).

---

## מסלול מומלץ: פרויקט Supabase **חדש (ריק)**

| # | קובץ | מה זה |
|---|------|--------|
| 1 | `database.sql` | **הבסיס המלא** — טבלאות, RLS, Storage, שדות דינמיים, סטטוסים, תבניות, חתימה וכו' |
| 2 | `profiles_team.sql` | `profiles` + תפקידים + **טריגר** לסנכרון `auth.users` (נדרש ל־admin / צוות) |
| 3 | `settings.sql` | טבלת `settings` (מפתחות כמו `admin_notification_phone`) |
| 4 | `migrations/crm_v2_enhancements.sql` | **שיוך שדות ללקוח** (`assigned_field_definition_ids`), סוכן, אודיט IP לחתימה |

**אחרי 1–4** המערכת אמורה לעבוד. את השאר — לפי צורך (בפרט פריסת כרטיס CRM).

---

## פריסת כרטיס CRM (לוח / מעצב) — לפי תלות

| # | קובץ | הערה |
|---|------|--------|
| 5 | `add_field_groups_layout.sql` | קבוצות שדות + עמודות נוספות ב־`custom_field_definitions` |
| 6 | `add_crm_layout_slots.sql` | `crm_layout_slots` (תלוי `custom_field_sections` מ־`database.sql`) |
| 7 | `add_crm_layout_sections.sql` | `crm_layout_sections` + מיגרציית FK מ־`custom_field_sections` |
| 8 | `add_crm_layout_dividers.sql` | מפרידים בין שורות (משנה `crm_layout_slots`) |
| 9 | `fix_crm_layout_slots_schema.sql` | **רק אם** יש שגיאת סכימה / conflict אחרי שדרוג |

**אלטרנטיבה:** `paste_crm_layout_supabase.sql` — גרסה "מאוחדת" לפריסה. **אל** תריץ בו־זמנית את 5–8 **ואת** `paste_…` בלי לבדוק כפילויות; בדרך כלל **או** קבצי `add_…` **או** `paste_…` (לפי מה שקרוב לסכימה אצלך).

---

## שדרוגי לקוח / מסמכים / עסקאות (לפי סדר בטוח)

| # | קובץ |
|---|------|
| 10 | `add_custom_field_calculation.sql` |
| 11 | `add_custom_field_sections.sql` — *לרוב כבר ב־`database.sql`*; בטוח `IF NOT EXISTS` |
| 12 | `add_custom_field_values.sql` |
| 13 | `add_custom_fields.sql` — *לרוב כבר ב־`database.sql`* |
| 14 | `add_client_statuses.sql` |
| 15 | `add_client_short_id.sql` — *לרוב כבר ב־`database.sql`* |
| 16 | `add_clients_created_at.sql` |
| 17 | `add_client_notes.sql` |
| 18 | `add_client_agreement_notes.sql` |
| 19 | `add_client_reminders_enabled.sql` |
| 20 | `add_client_reminders_hybrid.sql` |
| 21 | `add_client_lead_source.sql` |
| 22 | `add_client_lead_provider_name.sql` |
| 23 | `add_lead_providers.sql` |
| 24 | `add_client_total_amount_payment_status.sql` |
| 25 | `add_payments_table.sql` |
| 26 | `add_closed_by_and_rep_commission.sql` |
| 27 | `add_upload_request_active.sql` |
| 28 | `add_agreement_from_document.sql` |
| 29 | `add_agreement_template_selection.sql` |
| 30 | `add_agreement_structure_templates.sql` |
| 31 | `add_documents_storage_path.sql` — *לרוב כבר ב־`database.sql`* |
| 32 | `add_documents_needs_signature.sql` — *לרוב כבר ב־`database.sql`* |
| 33 | `add_documents_portal_signed_columns.sql` |
| 34 | `add_signature_templates.sql` — *לרוב כבר ב־`database.sql`* |
| 35 | `clients_signature_template_fkey_on_delete_set_null.sql` |
| 36 | `client_agreement_request.sql` |
| 37 | `setup_dynamic_docs.sql` |

---

## כללי / נתונים (הרץ רק אם רלוונטי)

| # | קובץ | הערה |
|---|------|--------|
| — | `client_crm_status.sql` | מסנכרן / מגדיר `status` טקסטואלי; **אם** כבר עברת ל־`status_id` + `client_statuses` מ־`database.sql` — בדרך כלל **לא** חובה |
| — | `update_docs.sql` | שדרוגים ל־`required_docs` / `templates` — **שדרוג** ממצב ישן |
| — | `update_fees.sql` | עדכוני עמלות / שדות — **בדוק לפני** מול DB קיים |

---

## רשימת שמות קבצים (העתקה מהירה)

```
database.sql
profiles_team.sql
settings.sql
migrations/crm_v2_enhancements.sql
add_field_groups_layout.sql
add_crm_layout_slots.sql
add_crm_layout_sections.sql
add_crm_layout_dividers.sql
fix_crm_layout_slots_schema.sql
add_custom_field_calculation.sql
add_custom_field_sections.sql
add_custom_field_values.sql
add_custom_fields.sql
add_client_statuses.sql
add_client_short_id.sql
add_clients_created_at.sql
add_client_notes.sql
add_client_agreement_notes.sql
add_client_reminders_enabled.sql
add_client_reminders_hybrid.sql
add_client_lead_source.sql
add_client_lead_provider_name.sql
add_lead_providers.sql
add_client_total_amount_payment_status.sql
add_payments_table.sql
add_closed_by_and_rep_commission.sql
add_upload_request_active.sql
add_agreement_from_document.sql
add_agreement_template_selection.sql
add_agreement_structure_templates.sql
add_documents_storage_path.sql
add_documents_needs_signature.sql
add_documents_portal_signed_columns.sql
add_signature_templates.sql
clients_signature_template_fkey_on_delete_set_null.sql
client_agreement_request.sql
setup_dynamic_docs.sql
client_crm_status.sql
update_docs.sql
update_fees.sql
paste_crm_layout_supabase.sql
```

**הערה:** `paste_crm_layout_supabase.sql` — בדרך כלל **לא** אחרי 5–8 ביחד; בחר מסלול אחד לפריסה.

---

## בדיקה אחרי ההרצה

- **Authentication** → יש לפחות משתמש admin; `profiles` עם `role = 'admin'`.
- **Table Editor** — `clients`, `custom_field_definitions`, `client_statuses` קיימים.
- **Storage** — Buckets: `documents-signed`, `documents-uploads`, `documents-templates` (מ־`database.sql`).

אם שגיאה — העתק את **ההודעה המלאה** מ־Supabase (שם אובייקט / שורה) ואז ממקמים את הקובץ שגורם לכך.
