# Supabase — איך פותחים ומעתיקים (אם הלחיצה על הלינק לא עובדת)

## איך לפתוח את הקבצים ב־Cursor

1. בצד **שמאל** (סייר קבצים) לחץ על התיקייה **`supabase`**
2. לחץ **פעמיים** על שם הקובץ (למשל `PASTE_01_CORE.sql`)
3. או: **Ctrl+O** (Open File) והדבק את **הנתיב המלא** למטה

## נתיבים מלאים במחשב שלך (העתק ל־Open File)

**מדריך מסודר (קרא קודם):**
```
c:\Users\User\Desktop\Itamar-Core-CRM\supabase\PASTE_GUIDE.md
```

**SQL להדבקה ב־Supabase (לפי סדר):**

1) חובה — בסיס:
```
c:\Users\User\Desktop\Itamar-Core-CRM\supabase\PASTE_01_CORE.sql
```

2) אופציונלי — פריסת כרטיס:
```
c:\Users\User\Desktop\Itamar-Core-CRM\supabase\PASTE_02_LAYOUT.sql
```

3) אופציונלי — תוספות:
```
c:\Users\User\Desktop\Itamar-Core-CRM\supabase\PASTE_03_ADDONS.sql
```

**רשימה של כל קבצי ה־SQL בנפרד:**
```
c:\Users\User\Desktop\Itamar-Core-CRM\SQL_RUN_ORDER.md
```

## אחרי שקובץ ה־`.sql` פתוח

1. **Ctrl+A** (הכל)
2. **Ctrl+C** (העתק)
3. ב־[Supabase](https://supabase.com) → הפרויך שלך → **SQL Editor** → **New query** → **Ctrl+V** → **Run**

## אם גם `Open File` לא מוצא

ודא שאתה בדיוק בתיקייה **`Itamar-Core-CRM`** (לא העתק ישן).  
פתח את **סייר הקבצים** (Windows) → `Desktop` → `Itamar-Core-CRM` → `supabase` — גרור קובץ לתוך חלון Cursor לפתוח אותו.

## שגיאה: `column templates.is_active does not exist`

הרץ **פעם אחת** ב־Supabase → SQL (או פתח והדבק):  
`migrations\add_templates_is_active.sql`  
(או הדבק: `alter table public.templates add column if not exists is_active boolean not null default true;`)

## שגיאה: `column document_types.download_link does not exist`

הרץ: `migrations\add_document_types_columns.sql` (או שני ה־`alter` שבתוכו).

## שגיאות: `lead_providers.phone` / `clients.closed_by` / `clients.lead_source`

הרץ **בבת אחת**: `migrations\add_lead_revenue_bootstrap.sql`  
(או הריצו בנפרד: `add_lead_providers.sql`, `add_client_lead_source.sql`, `add_client_lead_provider_name.sql`, `add_closed_by_and_rep_commission.sql` — **אחרי** ש־`profiles` קיימת).
