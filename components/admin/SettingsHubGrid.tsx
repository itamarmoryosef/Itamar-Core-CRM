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
    <h2 className="text-start text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {children}
    </h2>
  );
}

export function SettingsHubGrid({ onPickRubric, enabledFeatureCodes }: Props) {
  const showLeads = checkFeature(enabledFeatureCodes, ORG_FEATURE.leadProviders);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <SectionLabel>ליבה ומיתוג</SectionLabel>
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
            description="הרצת תזכורות WhatsApp מתוזמנות — כולל הדגמה 'הרץ עכשיו'."
            icon={Clock}
            cta="הגדרות"
            onPick={() => onPickRubric("reminders")}
          />
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>הודעות וממשקי שליחה</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SettingsModuleCard
            title="תבניות הודעות (SMS / WhatsApp)"
            description="ספריית הודעות, מילוי [שם], [לינק_פורטל] ושיוך אופציונלי לשלב ב־CRM."
            icon={MessageSquareText}
            iconClassName="h-5 w-5 text-emerald-600 dark:text-emerald-400"
            cta="פתח עורך"
            href="/admin/settings/messages"
          />
          <SettingsModuleCard
            title="חיבור WhatsApp"
            description="QR, Pairing, שירות Baileys — מסלול הודעה חופשית מכרטיס הלקוח."
            icon={MessageCircle}
            iconClassName="h-5 w-5 text-[#25D366]"
            cta="הגדרות"
            href="/admin/settings/whatsapp"
          />
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>הגדרות CRM</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SettingsModuleCard
            title="ניהול סטטוסים"
            description="צבעים, סדר, בוט, מצב בלשונית לקוח — מקור האמת ל־client_statuses."
            icon={Tags}
            cta="פתח"
            href="/admin/settings/statuses"
          />
          <SettingsModuleCard
            title="שדות מותאמים"
            description="הגדרת שאלות, סוגי שדות, חישובים — לשימוש בכרטיס ופורטל."
            icon={ListTree}
            cta="פתח"
            href="/admin/settings/fields"
          />
          <SettingsModuleCard
            title="פריסת כרטיס"
            description="אזורים, בלוקים, סדר — בונה UI של כרטיס הלקוח."
            icon={LayoutGrid}
            cta="פתח"
            href="/admin/settings/layout"
          />
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>מסמכים</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SettingsModuleCard
            title="סוגי מסמכים"
            description="רשימה, טפסי ריק להורדה, קישורי פורטל — ניהול סוגי קבצים."
            icon={FileType}
            cta="הגדרות"
            onPick={() => onPickRubric("docTypes")}
          />
          <SettingsModuleCard
            title="תבניות Word + קודים"
            description="העלאת ‎.docx לחתימה, הזרקת שדות וקישורי חתימה — באותו דף."
            icon={BookOpen}
            cta="הגדרות"
            onPick={() => onPickRubric("templates")}
          />
          <SettingsModuleCard
            title="עורך טפסי פורטל"
            description="בניית טפסי הסכמים/פורטל — בדף מוקדש."
            icon={BookOpen}
            cta="פתח"
            href="/admin/settings/templates"
          />
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>אנשים</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {showLeads ? (
            <SettingsModuleCard
              title="ספקי לידים"
              description="רשת ספקים, עמלות — כשהפיצ'ר פעיל."
              icon={Users}
              cta="הגדרות"
              onPick={() => onPickRubric("leads")}
            />
          ) : null}
          <SettingsModuleCard
            title="ניהול צוות"
            description="הזמנות, תפקיד, עמלה, סיסמאות — הכל כאן (בלי הזזה אחרת במערכת נפרדת)."
            icon={UserCog}
            cta="הגדרות"
            onPick={() => onPickRubric("team")}
          />
        </div>
      </div>

      <p className="text-start text-[11px] text-slate-500 dark:text-slate-400">
        <Send className="me-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
        שליחת הודעה ללקוח: מכרטיס הלקוח, לאחר{" "}
        <strong className="text-slate-600 dark:text-slate-300">תבניות + חיבור WA</strong>.
        <span className="ms-1 inline-flex items-center text-slate-400">·</span>
        <span className="ms-1">
          <Bot className="me-0.5 inline h-3.5 w-3.5 align-text-bottom" />
          בוט/תזכורות: גם בלשונית <strong>התראות</strong>.
        </span>
      </p>
    </div>
  );
}
