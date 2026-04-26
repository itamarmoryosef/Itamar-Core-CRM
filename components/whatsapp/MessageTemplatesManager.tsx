"use client";

import Link from "next/link";

export function MessageTemplatesManager() {
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-slate-300">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">מקורות תוכן להודעות</p>
      <p>
        שם המותג בטקסטים (ברוכים הבאים, תזכורות) נשלף מ־<strong>הגדרות → מיתוג</strong> במערכת.
        אם לא מולא — נעשה שימוש בערכי ברירת מחדל מ־<code className="mx-0.5 rounded bg-white px-1 text-xs dark:bg-zinc-800">NEXT_PUBLIC_BUSINESS_NAME</code> ו־<code className="rounded bg-white px-1 text-xs">lib/brandingPublic.ts</code>.
      </p>
      <ul className="list-inside list-disc space-y-1 text-start text-xs">
        <li>
          <Link
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            href="/admin/settings#branding"
          >
            מיתוג ושם מוצג (הגדרה במערכת)
          </Link>
        </li>
        <li>
          <Link
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            href="/admin/settings#notifications"
          >
            התראות (מספר מנהל, בוט, סטטוסים)
          </Link>
        </li>
        <li>
          <Link
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            href="/admin/clients"
          >
            לקוחות (שליחה ל־WhatsApp מכרטיס הלקוח)
          </Link>{" "}
          — לא <span className="text-slate-500">דף הבית</span>; הכוונה לרשימת הלקוחות בניהול.
        </li>
      </ul>
    </div>
  );
}
