export type CrmFieldWidth = "1/4" | "1/3" | "1/2" | "full";

export type CrmFieldType = "text" | "number" | "date" | "select" | "calculation";

export const CRM_FIELD_WIDTHS: CrmFieldWidth[] = ["1/4", "1/3", "1/2", "full"];

export const CRM_FIELD_TYPES: CrmFieldType[] = [
  "text",
  "number",
  "date",
  "select",
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
    select: "רשימה — בחירה",
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
    t === "calculation"
  ) {
    return t;
  }
  return "text";
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
  if (fieldType === "number" && !Number.isNaN(Number(v))) {
    return String(Number(v));
  }
  return v;
}
