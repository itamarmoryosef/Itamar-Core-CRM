export type CrmFieldWidth = "1/4" | "1/3" | "1/2" | "full";

export type CrmFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi_select"
  | "yes_no"
  | "calculation";

export const CRM_FIELD_WIDTHS: CrmFieldWidth[] = ["1/4", "1/3", "1/2", "full"];

export const CRM_FIELD_TYPES: CrmFieldType[] = [
  "text",
  "number",
  "date",
  "select",
  "multi_select",
  "yes_no",
  "calculation",
];

export function crmFieldWidthLabel(w: CrmFieldWidth): string {
  switch (w) {
    case "1/4":
      return "רבע (1/4)";
    case "1/3":
      return "שליש (1/3)";
    case "1/2":
      return "חצי (1/2)";
    default:
      return "מלא";
  }
}

/** תצוגה בעברית; הערכים ב-DB נשארים באנגלית (text, number, …) */
export function crmFieldTypeHebrewLabel(raw: string | null | undefined): string {
  const l = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!l) {
    return "טקסט";
  }
  const map: Record<string, string> = {
    text: "טקסט",
    textarea: "טקסט (כמה שורות)",
    number: "מספר",
    date: "תאריך",
    select: "בחירה מרשימה",
    multi_select: "בחירה מרובה",
    yes_no: "כן/לא",
    calculation: "חישוב (נוסחה)",
    checkbox: "תיבת סימון",
  };
  if (map[l]) {
    return map[l]!;
  }
  const n = normalizeCrmFieldType(l || undefined);
  return map[n] ?? l;
}

/** 12-column grid (legacy width strings) */
export function crmFieldWidthGridClass(w: string | null | undefined): string {
  switch (w) {
    case "1/4":
      return "col-span-12 sm:col-span-3";
    case "1/3":
      return "col-span-12 sm:col-span-4";
    case "1/2":
      return "col-span-12 sm:col-span-6";
    default:
      return "col-span-12";
  }
}

/**
 * Maps admin `column_span` (1–4 units of a 4-wide row) to `grid-cols-12` spans:
 * 1→3, 2→6, 3→9, 4→12. Matches the layout builder and client card row-for-row.
 */
export function crmAdminColumnSpanToGrid12(
  span: number | null | undefined
): string {
  const s = Math.min(4, Math.max(1, Math.round(Number(span) || 4)));
  switch (s) {
    case 1:
      return "col-span-3 min-w-0";
    case 2:
      return "col-span-6 min-w-0";
    case 3:
      return "col-span-9 min-w-0";
    default:
      return "col-span-12 min-w-0";
  }
}

const COLUMN_SPAN_TW: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
};

/** `grid-cols-4` row: span 1–4 columns */
export function crmColumnSpanClass(span: number | null | undefined): string {
  const n =
    typeof span === "number" && !Number.isNaN(span) ? Math.round(span) : 4;
  const s = Math.min(4, Math.max(1, n));
  return COLUMN_SPAN_TW[s] ?? "col-span-4";
}

export function normalizeCrmFieldType(
  raw: string | null | undefined
): CrmFieldType {
  const t = (raw ?? "text").trim().toLowerCase();
  if (t === "textarea") return "text";
  if (
    t === "text" ||
    t === "number" ||
    t === "date" ||
    t === "select" ||
    t === "multi_select" ||
    t === "yes_no" ||
    t === "calculation"
  ) {
    return t;
  }
  return "text";
}

/** JSON / טפסים: true|false כמחרוזת */
export function parseYesNoStoredValue(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (t === "true" || t === "1" || t === "yes" || t === "on" || t === "כן") {
    return true;
  }
  if (t === "false" || t === "0" || t === "no" || t === "off" || t === "לא") {
    return false;
  }
  return false;
}

/** Word / תצוגה: כאשר אין ערך — מחרוזת ריקה */
export function formatYesNoHebrewForDisplay(raw: string): string {
  if (!raw.trim()) return "";
  return parseYesNoStoredValue(raw) ? "כן" : "לא";
}

/** בפורמט שלנו: רק לאחר בחירה (כן או לא); ריק = טרם נבחר */
export function isYesNoAnswered(raw: string): boolean {
  return raw.trim() === "true" || raw.trim() === "false";
}

/**
 * ערך מתוך `<input type="date">` נשמר בדרך־כלל כ־`YYYY-MM-DD`. להטמעה ב-Word / תצוגה: פורמט `he-IL`.
 * אם המחרוזת בפורמט אחר — מוחזרת כמות שהיא.
 */
export function formatCrmDateValueForHebrewDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return t;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (mo < 0 || mo > 11) return t;
  const date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) {
    return t;
  }
  return date.toLocaleDateString("he-IL");
}

/** תאריך היום בלוקאל, `YYYY-MM-DD` (למשל ל־`min` ב־`<input type="date">`). */
export function crmLocalTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** האם `YYYY-MM-DD` מייצג יום לפני «היום» בלוקאל. */
export function isCrmDateYmdBeforeLocalToday(ymd: string): boolean {
  const t = ymd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  return t < crmLocalTodayYmd();
}

export type CrmDateFieldConfig = { requireFuture: boolean };

/**
 * שדה תאריך שמחייב עתיד: `options` ב־DB — אובייקט JSON `{ "requireFuture": true }`
 * (או מחרוזת JSON מפורשת). בנוסף, היוריסטיקה לפי תווית/slug (למשל «פגישה», `meeting`).
 */
export function parseCrmDateFieldConfig(
  options: unknown,
  label: string = "",
  slug: string = ""
): CrmDateFieldConfig {
  if (options && typeof options === "object" && !Array.isArray(options)) {
    const o = options as Record<string, unknown>;
    if (o.requireFuture === true) return { requireFuture: true };
    const inner = o.date;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const d = inner as Record<string, unknown>;
      if (d.requireFuture === true) return { requireFuture: true };
    }
  }
  if (typeof options === "string" && options.trim().startsWith("{")) {
    try {
      const j = JSON.parse(options) as unknown;
      if (j && typeof j === "object" && !Array.isArray(j)) {
        const o = j as Record<string, unknown>;
        if (o.requireFuture === true) return { requireFuture: true };
      }
    } catch {
      /* fall through */
    }
  }
  const l = (label + " " + slug).toLowerCase();
  if (
    /פגיש|לפגיש|תיאום|meeting|appointment|_future|require_future|תאריך.{0,4}עתידי/.test(
      l
    )
  ) {
    return { requireFuture: true };
  }
  return { requireFuture: false };
}

/**
 * שדה `number` ב-CRM: רק ספרות, נקודה עשרונית אחת, מינוס אופציונלי בהתחלה.
 * פסיק/פסיק ערבי (،) — ממופים לנקודה. תווים אחרים נמחקים.
 */
export function sanitizeCrmNumberInput(raw: string): string {
  if (raw === "") return "";
  const hasLeadingMinus = /^\s*-\s*/.test(String(raw));
  const withDots = String(raw)
    .replace(/،/g, ".")
    .replace(/,/g, ".");
  let s = withDots.replace(/[^0-9.]/g, "");
  if (s.includes(".")) {
    const i = s.indexOf(".");
    s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
  }
  if (hasLeadingMinus) {
    if (s === "") return "-";
    if (s === ".") return "-.";
    return `-${s}`;
  }
  return s;
}

/** ערכים ב־custom_fields_data כמחרוזת JSON: ["א","ב"]. לגיבוי: בחירה בודדת כטקסט. */
export function parseMultiSelectStoredValue(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (t.startsWith("[") && t.endsWith("]")) {
    try {
      const p = JSON.parse(t) as unknown;
      if (Array.isArray(p)) {
        return p.map((x) => String(x).trim()).filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }
  return [t];
}

/** שומר לפי סדר האפשרויות בשרטוט (ייצוב כרטיס/פורטל). */
export function serializeMultiSelectValue(
  selected: string[],
  optionList: string[]
): string {
  const set = new Set(selected.map((s) => s.trim()).filter(Boolean));
  const ordered = optionList.filter((o) => set.has(o));
  return ordered.length === 0 ? "" : JSON.stringify(ordered);
}

export function normalizeCrmFieldWidth(
  raw: string | null | undefined
): CrmFieldWidth {
  const w = (raw ?? "full").trim();
  if (w === "1/4" || w === "1/3" || w === "1/2" || w === "full") return w;
  return "full";
}

export function parseCrmSelectOptions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (x == null ? "" : String(x).trim()))
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j)) {
        return j
          .map((x) => (x == null ? "" : String(x).trim()))
          .filter(Boolean);
      }
    } catch {
      /* fall through */
    }
    return raw
      .split(/[\n,|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function stringifyValueForCustomData(
  fieldType: CrmFieldType,
  value: string
): string {
  const v = value.trim();
  if (v === "") return "";
  if (fieldType === "calculation") return v;
  if (fieldType === "number") {
    if (v === "" || v === "-") return "";
    const n = Number(v);
    if (!Number.isNaN(n) && Number.isFinite(n)) {
      return String(n);
    }
    return "";
  }
  if (fieldType === "multi_select") {
    const arr = parseMultiSelectStoredValue(v);
    if (arr.length === 0) return "";
    try {
      return JSON.stringify(arr);
    } catch {
      return v;
    }
  }
  if (fieldType === "yes_no") {
    if (v === "") return "";
    return parseYesNoStoredValue(v) ? "true" : "false";
  }
  return v;
}
