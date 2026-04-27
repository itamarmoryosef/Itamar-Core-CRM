/**
 * Heuristic import: map plain-text / Word-extracted text to `custom_fields_data` slugs
 * by matching each field's **label** (תווית) in the document.
 *
 * Best results when the document has lines like: "תווית: ערך" or "תווית - ערך"
 * (RTL/LTR; colon or dash as separator).
 */

export type FieldDefForImport = { label: string; slug: string };

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Longer labels first so e.g. "מחיר סופי" wins over "מחיר".
 */
function sortedDefs(defs: FieldDefForImport[]): FieldDefForImport[] {
  return [...defs]
    .filter((d) => d.label?.trim() && d.slug?.trim())
    .sort((a, b) => b.label.length - a.label.length);
}

/**
 * Extracts values for slugs from free text. Fills only keys that get a non-empty match.
 */
export function extractLabeledFieldValues(
  text: string,
  defs: FieldDefForImport[]
): { values: Record<string, string>; missingSlugs: string[] } {
  const values: Record<string, string> = {};
  const order = sortedDefs(defs);
  const lines = text.split(/\r?\n/);
  const nbsp = /\u00a0/g;
  const normalizedText = text.replace(nbsp, " ");
  const normalizedLines = lines.map((l) => l.replace(nbsp, " "));

  for (const d of order) {
    const L = d.label.trim();
    if (!L) continue;
    const e = escapeRe(L);
    const lineRe = new RegExp(
      `^\\s*${e}\\s*[:־\\-\\u2013\\u2014\\.]\\s*(.+)$`,
      "u"
    );
    for (const line of normalizedLines) {
      const t = line.trim();
      if (!t) continue;
      const m = t.match(lineRe);
      if (m?.[1]) {
        const v = m[1].trim();
        if (v) {
          values[d.slug] = v;
          break;
        }
      }
    }
  }

  for (const d of order) {
    if (values[d.slug]) continue;
    const L = d.label.trim();
    if (!L) continue;
    const e = escapeRe(L);
    const blockRe = new RegExp(
      `${e}\\s*[:־\\-\\u2013\\u2014\\.]\\s*([^\\n\\r]+)`,
      "u"
    );
    const m = normalizedText.match(blockRe);
    if (m?.[1]) {
      const v = m[1].trim();
      if (v) values[d.slug] = v;
    }
  }

  const missingSlugs = defs
    .map((d) => d.slug)
    .filter((slug) => !values[slug]?.trim());
  return { values, missingSlugs };
}
