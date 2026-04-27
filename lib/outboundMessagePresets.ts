/**
 * Static starter bodies for org outbound templates (Hebrew, RTL).
 * User saves a copy in DB and edits; [שם] etc. replaced at send (mergeClientOutboundMessage).
 */
export type OutboundMessagePreset = {
  id: string;
  title: string;
  description: string;
  defaultName: string;
  body: string;
  /** Default pick for associated_status — optional, UI may leave empty */
  suggestedForStatusLabel?: string;
};

export const OUTBOUND_MESSAGE_PRESETS: OutboundMessagePreset[] = [
  {
    id: "welcome_crm",
    title: "ברוך הבא / פתיחת קשר",
    description: "הקדמה קצרה ואנושית אחרי פתיחת תיק או שיחה ראשונה.",
    defaultName: "ברוך הבא / פתיחת קשר",
    body: `שלום [שם_פרטי],

אני מ[שם_מותג] – קיבלנו את הפרטים ונתחיל בטיפול.
לכל שאלה: [טלפון] או השב/י להודעה.

יום נעים!`,
  },
  {
    id: "meeting_scheduled",
    title: "תיאום פגישה / שיחה",
    description: "הודעה אחרי קביעת מועד: ניתן לתקן שעה ותאריך ביד.",
    defaultName: "תיאום פגישה",
    body: `שלום [שם_פרטי],

תואמה לך פגישה בנוגע לבקשה שלך.
לפרטים/שינוי מועד השב/י בוואטסאפ.

בברכה,
[שם_מותג]`,
    suggestedForStatusLabel: "בטיפול",
  },
  {
    id: "docs_missing",
    title: "חסרים מסמכים",
    description: "לידיעה: לאחר הוספת [לינק_פורטל] — חיבור API כברדגם בפורטל.",
    defaultName: "השלמת מסמכים",
    body: `שלום [שם_מלא],

חסרים מסמכים כדי להמשיך. ניתן להעלות כאן:
[לינק_פורטל]

לשאלות — [טלפון].

[שם_מותג]`,
    suggestedForStatusLabel: "ממתין למסמכים",
  },
  {
    id: "status_progress",
    title: "עדכון בטיפול",
    description: "הודעה כללית על התקדמות בלי אישור סופי.",
    defaultName: "עדכון בטיפול",
    body: `היי [שם_פרטי],

מעדכנים/ות שאנו ממשיכים בבדיקה ובטיפול בעניינך. נעדכן/נה כשיידענו.

[שם_מותג]`,
    suggestedForStatusLabel: "בטיפול",
  },
  {
    id: "reminder_gentle",
    title: "תזכורת עדינה",
    description: "נידנוד קצר בלי שפה אגרסיבית.",
    defaultName: "תזכורת",
    body: `שלום [שם_פרטי],

רק נזכיר/ה במידה ואפשר להשלים את הפרטים. נשמח לעזור: [טלפון]

[שם_מותג]`,
  },
  {
    id: "after_status_done",
    title: "הסתיים / סגירה",
    description: "לאחר סיום הטיפול או העברה לשלב ‘הושלם’.",
    defaultName: "סיום / סגירה",
    body: `שלום [שם_מלא],

תודה שעבדנו יחד. לכל עניין נוסף: [טלפון] או [לינק_פורטל]

בהצלחה,
[שם_מותג]`,
    suggestedForStatusLabel: "הושלם",
  },
  {
    id: "phone_followup",
    title: "אחזור / זמנים",
    description: "טון קליל — ניצור קשר בטלפון (לא חובה ללינק).",
    defaultName: "מענה טלפוני",
    body: `היי [שם_פרטי], נאחזור/ניצור איתך קשר בטלפון [טלפון] (או השב/י בוואטסאפ) לגבי בקשתך.

[שם_מותג]`,
  },
];

export function getOutboundMessagePreset(
  id: string
): OutboundMessagePreset | undefined {
  return OUTBOUND_MESSAGE_PRESETS.find((p) => p.id === id);
}
