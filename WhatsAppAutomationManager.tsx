"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

const tr: Record<string, string> = {
  "settings.section_whatsapp_automation": "אוטומציית WhatsApp",
  "settings.whatsapp_automation_desc": "הודעות אוטומטיות כאשר הלקוח אינו עונה, והודעת פתיחה לפי בחירה.",
  "settings.whatsapp_automation_enable": "הפעל אוטומציה",
  "settings.whatsapp_automation_no_answer": "תבנית • ללא מענה",
  "settings.whatsapp_automation_placeholders": "משתנים: {first_name}, {company_name} ואחרים לפי מערכת",
  "settings.whatsapp_automation_welcome": "הודעת פתיחה (ברוכים הבאים)",
  "settings.whatsapp_automation_welcome_enable": "הפעל הודעת פתיחה",
  "settings.save": "שמור",
  "settings.saved": "נשמר",
};

function t(key: string): string {
  return tr[key] ?? key;
}

export function WhatsAppAutomationManager() {
  const isRtl = true;
  const [enabled, setEnabled] = React.useState(false);
  const [noAnswerTemplate, setNoAnswerTemplate] = React.useState("");
  const [welcomeEnabled, setWelcomeEnabled] = React.useState(false);
  const [welcomeTemplate, setWelcomeTemplate] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const fetchConfig = React.useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp-automation");
      if (res.ok) {
        const data = await res.json();
        setEnabled(data.enabled ?? false);
        setNoAnswerTemplate(
          data.noAnswerTemplate ??
            "היי {first_name}, ניסיתי להשיג אותך מ-{company_name} ולא היית זמין. מתי נוח לך שנדבר?"
        );
        setWelcomeEnabled(data.welcomeEnabled ?? false);
        setWelcomeTemplate(
          data.welcomeTemplate ??
            "היי {first_name}, תודה שפנית אלינו! קיבלנו את הפרטים שלך ונציג מ-{company_name} יחזור אליך בהקדם. בינתיים, יש משהו ספציפי שנוכל לעזור בו?"
        );
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const handleSave = React.useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/whatsapp-automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          noAnswerTemplate: noAnswerTemplate.trim() || undefined,
          welcomeEnabled,
          welcomeTemplate: welcomeTemplate.trim() || undefined,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }, [enabled, noAnswerTemplate, welcomeEnabled, welcomeTemplate]);

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900" dir="rtl">
      <div className="border-b border-slate-100 p-4 dark:border-zinc-800 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">{t("settings.section_whatsapp_automation")}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.whatsapp_automation_desc")}</p>
      </div>
      <div className="space-y-6 p-4 sm:p-6">
        <div className={cn("flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4 dark:border-zinc-700", isRtl && "flex-row-reverse")}>
          <label htmlFor="wa-auto-toggle" className="cursor-pointer text-sm font-medium text-slate-800 dark:text-zinc-200">
            {t("settings.whatsapp_automation_enable")}
          </label>
          <button
            id="wa-auto-toggle"
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((prev) => !prev)}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors",
              enabled ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-600"
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform",
                enabled ? (isRtl ? "left-1" : "translate-x-6") : "left-1"
              )}
            />
          </button>
        </div>

        <div className="space-y-2">
          <label htmlFor="wa-no-answer" className="block text-sm font-medium text-slate-800 dark:text-zinc-200">
            {t("settings.whatsapp_automation_no_answer")}
          </label>
          <textarea
            id="wa-no-answer"
            value={noAnswerTemplate}
            onChange={(e) => setNoAnswerTemplate(e.target.value)}
            placeholder="היי {first_name}, ניסיתי להשיג אותך מ-{company_name} ולא היית זמין. מתי נוח לך שנדבר?"
            className="min-h-[120px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            dir="rtl"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("settings.whatsapp_automation_placeholders")}</p>
        </div>

        <div className="border-t border-slate-100 pt-6 dark:border-zinc-800">
          <h3 className="mb-4 text-base font-medium text-slate-900 dark:text-zinc-100">
            {t("settings.whatsapp_automation_welcome")}
          </h3>
          <div className={cn("mb-4 flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4 dark:border-zinc-700", isRtl && "flex-row-reverse")}>
            <label htmlFor="wa-welcome-toggle" className="cursor-pointer text-sm font-medium text-slate-800 dark:text-zinc-200">
              {t("settings.whatsapp_automation_welcome_enable")}
            </label>
            <button
              id="wa-welcome-toggle"
              type="button"
              role="switch"
              aria-checked={welcomeEnabled}
              onClick={() => setWelcomeEnabled((prev) => !prev)}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                welcomeEnabled ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-600"
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  welcomeEnabled ? (isRtl ? "left-1" : "translate-x-6") : "left-1"
                )}
              />
            </button>
          </div>
          <div className="space-y-2">
            <label htmlFor="wa-welcome" className="block text-sm font-medium text-slate-800 dark:text-zinc-200">
              {t("settings.whatsapp_automation_welcome")}
            </label>
            <textarea
              id="wa-welcome"
              value={welcomeTemplate}
              onChange={(e) => setWelcomeTemplate(e.target.value)}
              placeholder="היי {first_name}, תודה שפנית אלינו! קיבלנו את הפרטים שלך ונציג מ-{company_name} יחזור אליך בהקדם. בינתיים, יש משהו ספציפי שנוכל לעזור בו?"
              className="min-h-[120px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              dir="rtl"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("settings.whatsapp_automation_placeholders")}</p>
          </div>
        </div>

        <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("settings.save")}
              </>
            ) : (
              t("settings.save")
            )}
          </button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">{t("settings.saved")}</span>}
        </div>
      </div>
    </div>
  );
}
