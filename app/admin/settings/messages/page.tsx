import Link from "next/link";
import { MessageTemplatesManager } from "@/components/whatsapp/MessageTemplatesManager";

export const metadata = {
  title: "תבניות הודעות | ניהול",
};

export default function AdminMessageTemplatesPage() {
  return (
    <div
      className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100 sm:p-6"
      dir="rtl"
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link
            href="/admin/settings"
            className="text-sm font-medium text-brand hover:underline"
          >
            ← חזרה להגדרות
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            תבניות הודעות (SMS / WhatsApp)
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            ספריית הודעות, שיוך לשלב ב־CRM, ומילוי אוטומטי מכרטיס הלקוח. מיתוג
            (שם מותג) נלקח מ־<strong>הגדרות → מיתוג</strong> כאשר ממלאים{" "}
            <code className="rounded bg-slate-200 px-1 text-xs dark:bg-zinc-800">[שם_מותג]</code>
            .
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 sm:p-6">
          <MessageTemplatesManager />
        </div>
      </div>
    </div>
  );
}
