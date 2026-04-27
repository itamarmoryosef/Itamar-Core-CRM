import Link from "next/link";
import { WhatsAppIntegration } from "@/components/whatsapp/WhatsAppIntegration";

export const metadata = {
  title: "חיבור WhatsApp | ניהול",
};

export default function AdminWhatsAppSettingsPage() {
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
          <h1 className="mt-2 text-2xl font-bold tracking-tight">חיבור WhatsApp</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            סרקו QR או השתמשו ב-Pairing Code. השרת (Baileys) חייב לרוץ 24/7 — ראו
            <code className="mx-1 rounded bg-slate-200 px-1 text-xs dark:bg-zinc-800">
              services/whatsapp-service
            </code>{" "}
            והגדירו{" "}
            <code className="rounded bg-slate-200 px-1 text-xs dark:bg-zinc-800">
              WHATSAPP_SERVICE_URL
            </code>{" "}
            ו-{" "}
            <code className="rounded bg-slate-200 px-1 text-xs dark:bg-zinc-800">
              WHATSAPP_SERVICE_TOKEN
            </code>{" "}
            באפליקציית Next.
          </p>
        </div>
        <WhatsAppIntegration />
      </div>
    </div>
  );
}
