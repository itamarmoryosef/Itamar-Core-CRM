# מדריך: העתקה והדבקה ב־Supabase

**אם הלינקים לא נפתחים:** `PASTE_START_HERE.md` בשורש הפרויקט (נתיבים מלאים, `Ctrl+O`).

מסמך לפתיחה ב־Cursor / Notepad. **העתק** את תוכן קובץ ה־`.sql` המתאים → **Supabase** → **SQL Editor** → **New query** → **הדבק** → **Run** (או `Ctrl+Enter`).

---

## לפני שמתחילים

- פרויקט Supabase (חדש = מומלץ DB ריק).
- גיבוי אם מעדכנים DB **קיים** עם נתונים.
- **שלב 1 = חובה** כדי שהאפליקציה תתאים לסכימה.

---

## שלב 1 — CORE (חובה)

| פעולה | קובץ |
|--------|------|
| פתח | `supabase/PASTE_01_CORE.sql` |
| העתק **את כל** התוכן (Ctrl+A, Ctrl+C) | |
| הדבק ב־Supabase → Run | |

**כולל:** `database.sql` + `profiles_team.sql` + `settings.sql` + `migrations/crm_v2_enhancements.sql`

**אחרי בדיקה:**  
Authentication: משתמשים. Table Editor: `clients`, `templates`, `custom_field_definitions`…

---

## שלב 2 — פריסת כרטיס CRM (אופציונלי)

רק אם אתה צריך **מעצב כרטיס / `crm_layout_*`**.

| פתח | `supabase/PASTE_02_LAYOUT.sql` |

**לא** מריץ **בו־זמנית** גם `paste_crm_layout_supabase.sql` בלי לוודא שאין כפילות.

---

## שלב 3 — תוספות סכימה (אופציונלי)

| פתח | `supabase/PASTE_03_ADDONS.sql` |

מאחדים הרבה קבצי `add_*.sql`. רבים `IF NOT EXISTS` — בטוח על DB שכבר הוסיפה חלק מהשדות מ־שלב 1.

---

## קבצים בודדים (רק לפי צורך)

| מצב | קובץ |
|-----|------|
| שגיאת סכימה ב־`crm_layout_slots` | `fix_crm_layout_slots_schema.sql` (מריץ **בנפרד**) |
| יש לך פריסה "מאוחדת" אחרת | `paste_crm_layout_supabase.sql` (במקום שלב 2, לא ביחד) |
| מיגרציה ממצב טקסט/ישן | `client_crm_status.sql`, `update_docs.sql`, `update_fees.sql` — **קרא** לפני (`IF` עדכוני נתונים) |

---

## סדר קצר (רשימת קבצי המקור)

1. `database.sql`  
2. `profiles_team.sql`  
3. `settings.sql`  
4. `migrations/crm_v2_enhancements.sql`  
5. … (שאר — כמו `SQL_RUN_ORDER.md` בשורש הפרויקט)

---

## טיפ

אם `Run` נכשל — **העתק את הודעת השגיאה** מה־Supabase (שורה/אובייקט). לעיתים צריך להריץ **מקטע אחד** (עד `BEGIN/END` הבא) אם Supabase מגביל batch.
