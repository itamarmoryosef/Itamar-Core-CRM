/**
 * Client `custom_fields_data` JSONB: keys = slug from `custom_field_definitions`,
 * values = string. Word placeholders: `{custom_slug}` / `{{custom_slug}}`.
 */

export function parseClientCustomFieldsData(
  raw: unknown
): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const slug = k.trim();
    if (!/^[a-zA-Z0-9_]+$/.test(slug)) continue;
    out[slug] = v == null ? "" : String(v);
  }
  return out;
}

/** List/card UI: prefer JSON name-like slugs, then column `clients.full_name`. */
export function displayClientNameFromRow(row: {
  full_name?: string | null;
  custom_fields_data?: unknown;
}): string {
  const parsed = parseClientCustomFieldsData(row.custom_fields_data);
  const fromCustom = String(
    parsed.full_name ?? parsed.name ?? parsed.client_name ?? ""
  ).trim();
  const col = String(row.full_name ?? "").trim();
  return fromCustom || col || "ללא שם";
}

/** Docxtemplater / Word data keys: `custom_${slug}` */
export function customPlaceholdersFromClientJson(
  raw: unknown
): Record<string, string> {
  const flat = parseClientCustomFieldsData(raw);
  const out: Record<string, string> = {};
  for (const [slug, val] of Object.entries(flat)) {
    out[`custom_${slug}`] = val;
  }
  return out;
}

/**
 * Ensures every defined CRM custom field slug exists as `custom_${slug}` for
 * Docxtemplater (empty string when the client has no stored value).
 */
export function customPlaceholdersForDocx(
  raw: unknown,
  definitionSlugs: readonly string[]
): Record<string, string> {
  const out = { ...customPlaceholdersFromClientJson(raw) };
  for (const rawSlug of definitionSlugs) {
    const slug = normalizeCustomFieldSlugInput(String(rawSlug ?? ""));
    if (!slug) continue;
    const key = `custom_${slug}`;
    if (!(key in out)) out[key] = "";
  }
  return out;
}

export function normalizeCustomFieldSlugInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Common Hebrew CRM labels → readable English slugs (optional; transliteration fills gaps). */
const HEBREW_LABEL_TO_SLUG: Record<string, string> = {
  מחיר: "price",
  "מחיר עסקה": "deal_price",
  "מחיר סופי": "final_price",
  "מחיר מוערך": "estimated_price",
  סכום: "amount",
  "סכום כולל": "total_amount",
  תשלום: "payment",
  מקדמה: "upfront",
  יתרה: "balance",
  תאריך: "date",
  שם: "name",
  "שם מלא": "full_name",
  טלפון: "phone",
  נייד: "mobile",
  כתובת: "address",
  עיר: "city",
  מיקוד: "zip",
  אימייל: "email",
  מייל: "email",
  הערות: "notes",
  הערה: "note",
  סטטוס: "status",
  מקור: "source",
  ליד: "lead",
  עורך: "editor",
  "עורך דין": "attorney",
  תעודת: "id_doc",
  "תעודת זהות": "id_number",
  זהות: "id_number",
  חתימה: "signature",
  הסכם: "agreement",
  נשק: "weapon",
  רישיון: "license",
  עסקה: "deal",
};

const HEBREW_CHAR_TO_LATIN: Record<string, string> = {
  א: "a",
  ב: "b",
  ג: "g",
  ד: "d",
  ה: "h",
  ו: "v",
  ז: "z",
  ח: "ch",
  ט: "t",
  י: "y",
  ך: "k",
  כ: "k",
  ל: "l",
  ם: "m",
  מ: "m",
  ן: "n",
  נ: "n",
  ס: "s",
  ע: "a",
  ף: "p",
  פ: "p",
  ץ: "ts",
  צ: "ts",
  ק: "k",
  ר: "r",
  ש: "sh",
  ת: "t",
  "\u05F3": "",
  "\u05F4": "",
  " ": "_",
};

function stripHebrewNiqqud(s: string): string {
  return s.replace(/[\u0591-\u05C7]/g, "");
}

function transliterateHebrewToken(token: string): string {
  const stripped = stripHebrewNiqqud(token);
  let out = "";
  for (const ch of stripped) {
    out += HEBREW_CHAR_TO_LATIN[ch] ?? "";
  }
  return out;
}

/**
 * Produces a readable slug basis from a display label (English normalization or
 * Hebrew dictionary / transliteration). Not guaranteed unique — pair with
 * {@link ensureUniqueCustomFieldSlug}.
 */
export function suggestSlugFromLabel(label: string): string {
  const t = label.trim();
  if (!t) return "";

  const hasHebrew = /[\u0590-\u05FF]/.test(t);
  if (!hasHebrew) {
    const ascii = normalizeCustomFieldSlugInput(t);
    if (ascii.length >= 1) return ascii.slice(0, 48);
    return "";
  }

  const compact = stripHebrewNiqqud(t.replace(/\s+/g, " ").trim());
  const exact = HEBREW_LABEL_TO_SLUG[compact];
  if (exact) return normalizeCustomFieldSlugInput(exact).slice(0, 48) || exact.slice(0, 48);

  const words = compact.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  for (const w of words) {
    const mapped = HEBREW_LABEL_TO_SLUG[w];
    if (mapped) {
      parts.push(normalizeCustomFieldSlugInput(mapped) || mapped);
    } else {
      const tr = transliterateHebrewToken(w);
      if (tr) parts.push(tr);
    }
  }

  let joined = parts.join("_").toLowerCase().replace(/[^a-z0-9_]/g, "").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (joined === "price_deal") joined = "deal_price";

  if (joined.length < 2) {
    joined = `field_${Date.now().toString(36).slice(-7)}`;
  }
  return joined.slice(0, 48);
}

/** Returns a slug not present in `reserved` (does not mutate `reserved`). */
export function ensureUniqueCustomFieldSlug(
  basis: string,
  reserved: ReadonlySet<string>
): string {
  let slug = normalizeCustomFieldSlugInput(basis);
  if (!slug || slug.length < 2) {
    slug = `field_${Date.now().toString(36).slice(-8)}`;
  }
  let candidate = slug;
  let n = 0;
  while (reserved.has(candidate)) {
    n += 1;
    candidate = `${slug}_${n}`;
  }
  return candidate;
}

/** Placeholder string for Word / docx templates (docxtemplater style). */
export function customFieldWordPlaceholder(slug: string): string {
  const s = normalizeCustomFieldSlugInput(slug);
  return `{{custom_${s || "slug"}}}`;
}
