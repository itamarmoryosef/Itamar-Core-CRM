"use client";

import {
  Bell,
  BookOpen,
  Bot,
  Clock,
  FileType,
  LayoutGrid,
  ListTree,
  MessageCircle,
  MessageSquareText,
  Send,
  Sparkles,
  Tags,
  UserCog,
  Users,
} from "lucide-react";
import { SettingsModuleCard } from "@/components/admin/SettingsModuleCard";
import { SettingsCollapsible } from "@/components/admin/SettingsCollapsible";
import { checkFeature } from "@/lib/checkFeature";
import { ORG_FEATURE } from "@/lib/orgFeatureCodes";
import type { ReactNode } from "react";

export type SettingsRubricKey =
  | "branding"
  | "notifications"
  | "reminders"
  | "leads"
  | "docTypes"
  | "templates"
  | "team";

type Props = {
  onPickRubric: (k: SettingsRubricKey) => void;
  enabledFeatureCodes: string[] | null;
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-start text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {children}
    </h3>
  );
}

export function SettingsHubGrid({ onPickRubric, enabledFeatureCodes }: Props) {
  const showLeads = checkFeature(enabledFeatureCodes, ORG_FEATURE.leadProviders);

  return (
    <div className="space-y-4">
      <SettingsCollapsible
        title="ליבה, מיתוג ותקשורת"
        subtitle="הגדרות בדף זה, וקישור לתבניות/וואטסאפ"
        defaultOpen
      >
        <div className="space-y-3">
          <SectionLabel>מיתוג והתראות</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SettingsModuleCard
              title="מותג ומראה"
              description="שם עסק, צבעים, לוגו — מוצג בפורטל, PDF והודעות."
              icon={Sparkles}
              cta="הגדרות"
              onPick={() => onPickRubric("branding")}
            />
            <SettingsModuleCard
              title="התראות מנהל ולקוח"
              description="מספר לעדכונים, בניית סטטוסים, בוט לתזכורות לפי שלב."
              icon={Bell}
              cta="הגדרות"
              onPick={() => onPickRubric("notifications")}
            />
            <SettingsModuleCard
              title="תזכורות אוטומטיות (קרון)"
              description="תזמון תזכורות WhatsApp — כולל הרצה ידנית לבדיקה."
              icon={Clock}
              cta="הגדרות"
              onPick={() => onPickRubric("reminders")}
            />
          </div>
        </div>
        <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 dark:border-zinc-800">
          <SectionLabel>הודעות</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SettingsModuleCard
              title="תבניות הודעות (SMS / WhatsApp)"
              description="תבניות, תגיות [שם], [לינק_פורטל], שיוך לשלב ב-CRM."
              icon={MessageSquareText}
              iconClassName="h-5 w-5 text-emerald-600 dark:text-emerald-400"
              cta="פתח עורך"
              href="/admin/settings/messages"
            />
            <SettingsModuleCard
              title="חיבור WhatsApp"
              description="QR, זיווג, Baileys — הודעות מכרטיס הלקוח."
              icon={MessageCircle}
              iconClassName="h-5 w-5 text-[#25D366]"
              cta="הגדרות"
              href="/admin/settings/whatsapp"
            />
          </div>
        </div>
      </SettingsCollapsible>

      <SettingsCollapsible
        title="לקוחות ו-CRM"
        subtitle="סטטוסים, בוני שדה ורשימת הגדרות"
        defaultOpen
      >
        <div className="space-y-3">
          <SectionLabel>הגדרות שדה</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SettingsModuleCard
              title="ניהול סטטוסים"
              description="צבעים, סדר, בוט, תצוגה בכרטיס — טבלת client_statuses."
              icon={Tags}
              cta="פתח"
              href="/admin/settings/statuses"
            />
            <SettingsModuleCard
              title="שדות ופריסת כרטיס"
              description="בוני רשת: שדות, גרירה, רוחב, שורות — הפריסה הוויזואלית."
              icon={LayoutGrid}
              cta="פתח בוני"
              href="/admin/settings/layout"
            />
            <SettingsModuleCard
              title="רשימת שדות (טבלה)"
              description="ריכוז שדות, מזהי slug, ייבוא ממסמך, עריכה מהירה."
              icon={ListTree}
              cta="פתח"
              href="/admin/settings/fields"
            />
          </div>
        </div>
      </SettingsCollapsible>

      <SettingsCollapsible
        title="מסמכים ותבניות"
        subtitle="Word, פורטל, סוגי מסמכים"
        defaultOpen
      >
        <div className="space-y-3">
          <SectionLabel>הסכמים ומסמכי לקוח</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SettingsModuleCard
              title="סוגי מסמכים"
              description="קטלוג, טפסי ריק, פורטל — ניהול סוגי קבצים."
              icon={FileType}
              cta="הגדרות"
              onPick={() => onPickRubric("docTypes")}
            />
            <SettingsModuleCard
              title="תבניות Word + קודי מיזוג"
              description="העלאת ‎.docx, שדות מותאמים, הזרקה וחתימה."
              icon={BookOpen}
              cta="הגדרות"
              onPick={() => onPickRubric("templates")}
            />
            <SettingsModuleCard
              title="עורך טפסי פורטל"
              description="שיוך תבנית ללקוחות ולפריסה."
              icon={BookOpen}
              cta="פתח"
              href="/admin/settings/templates"
            />
          </div>
        </div>
      </SettingsCollapsible>

      <SettingsCollapsible
        title="אנשים"
        subtitle="ספקי לידים (אופציונלי) וצוות"
        defaultOpen
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {showLeads ? (
            <SettingsModuleCard
              title="ספקי לידים"
              description="עמלות ורשת ספקים — כשהפיצ'ר מופעל."
              icon={Users}
              cta="הגדרות"
              onPick={() => onPickRubric("leads")}
            />
          ) : null}
          <SettingsModuleCard
            title="ניהול צוות"
            description="הזמנה, תפקיד, עמלה, סיסמה — לרבות יצירת משתמש."
            icon={UserCog}
            cta="הגדרות"
            onPick={() => onPickRubric("team")}
          />
        </div>
      </SettingsCollapsible>

      <details className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 text-start dark:border-zinc-800 dark:bg-zinc-900/20">
        <summary className="cursor-pointer list-none text-xs font-medium text-slate-600 dark:text-slate-300 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5 shrink-0" aria-hidden />
            טיפ: שליחה ללקוח ותזכורות
          </span>
        </summary>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          הודעה ללקוח — מכרטיס הלקוח אחרי התקנת{" "}
          <span className="text-slate-600 dark:text-slate-300">תבניות + חיבור וואטסאפ</span>
          <span className="mx-1">·</span>
          <Bot className="me-0.5 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
          בוט ותזכורות לפי שלב — בלשונית <strong className="font-medium">התראות</strong>.
        </p>
      </details>
    </div>
  );
}
