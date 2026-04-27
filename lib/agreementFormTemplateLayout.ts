import { parseClientCustomFieldsData } from "@/lib/customFieldsTemplate";
import {
  formatCrmDateValueForHebrewDisplay,
  formatYesNoHebrewForDisplay,
  normalizeCrmFieldType,
} from "@/lib/crmFieldLayout";

export type TemplateFieldDefinition = {
  label: string;
  slug: string;
  field_type: string;
  /** When `field_type` is `calculation`: expression with `{{slug}}` placeholders. */
  formula?: string | null;
  options?: unknown;
  /** CRM field group (`custom_field_definitions.section_id` — Yoatzim «כרטיס»). */
  section_id?: string | null;
  section_title?: string | null;
  section_sort_order?: number;
  /** Admin layout: row within section */
  crm_row_number?: number;
  /** Admin layout: width 1–4 in CRM grid → 12-col portal via {@link crmAdminColumnSpanToGrid12} */
  crm_column_span?: number;
  crm_sort_order?: number;
};

export type TemplateFieldRow = {
  id: string;
  row_number: number;
  col_span: number;
  sort_order: number;
  definition_id: string;
  definition: TemplateFieldDefinition;
};

/** Group fields into rows; each row sorted by sort_order. */
export function groupTemplateFieldsByRow(
  fields: TemplateFieldRow[]
): TemplateFieldRow[][] {
  const byRow = new Map<number, TemplateFieldRow[]>();
  for (const f of fields) {
    const r = f.row_number;
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r)!.push(f);
  }
  for (const arr of byRow.values()) {
    arr.sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.definition.label.localeCompare(b.definition.label, "he")
    );
  }
  return Array.from(byRow.keys())
    .sort((a, b) => a - b)
    .map((k) => byRow.get(k)!);
}

/** Portal: one CRM card (section) with rows of fields. */
export type PortalFormSectionBlock = {
  sectionId: string | null;
  title: string;
  sectionSort: number;
  rows: TemplateFieldRow[][];
};

const NO_SECTION_KEY = "__no_section__";

/**
 * Rows on the signature template canvas (`signature_template_fields.row_number`),
 * not the CRM definition row. Using CRM rows here merged unrelated template rows
 * and hid or scrambled fields after the 12-column / layout update.
 */
function groupTemplateFieldsByTemplateRowInSection(
  fields: TemplateFieldRow[]
): TemplateFieldRow[][] {
  const byRow = new Map<number, TemplateFieldRow[]>();
  for (const f of fields) {
    const r = Number(f.row_number) || 1;
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r)!.push(f);
  }
  for (const arr of byRow.values()) {
    arr.sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        (a.definition.crm_sort_order ?? 0) -
          (b.definition.crm_sort_order ?? 0) ||
        a.definition.label.localeCompare(b.definition.label, "he")
    );
  }
  return Array.from(byRow.keys())
    .sort((a, b) => a - b)
    .map((k) => byRow.get(k)!);
}

/**
 * Group portal fields by CRM section (`section_id`), then by template row inside each section
 * (`signature_template_fields.row_number` / {@link TemplateFieldRow.row_number}).
 * PDF generation still uses {@link groupTemplateFieldsByRow} on the flat list (template rows).
 */
export function groupTemplateFieldsBySectionAndRow(
  fields: TemplateFieldRow[]
): PortalFormSectionBlock[] {
  if (fields.length === 0) return [];
  const bySection = new Map<string, TemplateFieldRow[]>();
  for (const f of fields) {
    const sid = f.definition.section_id?.trim() || NO_SECTION_KEY;
    if (!bySection.has(sid)) bySection.set(sid, []);
    bySection.get(sid)!.push(f);
  }
  const blocks: PortalFormSectionBlock[] = [];
  for (const [key, list] of bySection.entries()) {
    const first = list[0]!;
    const sectionId = key === NO_SECTION_KEY ? null : key;
    const title =
      (first.definition.section_title?.trim() ||
        (sectionId ? "פרטים" : "פרטים כלליים")) ?? "פרטים";
    const sectionSort =
      first.definition.section_sort_order ??
      (sectionId ? 0 : 1_000_000);
    blocks.push({
      sectionId,
      title,
      sectionSort,
      rows: groupTemplateFieldsByTemplateRowInSection(list),
    });
  }
  blocks.sort(
    (a, b) =>
      a.sectionSort - b.sectionSort ||
      a.title.localeCompare(b.title, "he")
  );
  return blocks;
}

export type PdfStructuredRow = {
  cells: { label: string; value: string; colSpan: number }[];
};

const EMPTY_PLACEHOLDER = "________________";

/**
 * Build react-pdf rows: one row per template row; cells use flex colSpan (1–4 of 4).
 * @param hideEmpty — omit cells with no value (label still matters only if shown elsewhere)
 */
export function buildPdfStructuredRows(
  grouped: TemplateFieldRow[][],
  customFieldsData: unknown,
  opts?: { hideEmpty?: boolean }
): PdfStructuredRow[] {
  const data = parseClientCustomFieldsData(customFieldsData);
  const hideEmpty = opts?.hideEmpty === true;
  const out: PdfStructuredRow[] = [];

  for (const row of grouped) {
    const cells: PdfStructuredRow["cells"] = [];
    for (const tf of row) {
      const slug = tf.definition.slug;
      const raw = (data[slug] ?? "").trim();
      if (hideEmpty && !raw) continue;
      const ft = normalizeCrmFieldType(tf.definition.field_type);
      const isYesNo = ft === "yes_no";
      const isDate = ft === "date";
      let value: string;
      if (isYesNo) {
        value =
          formatYesNoHebrewForDisplay((data[slug] ?? "")) || EMPTY_PLACEHOLDER;
      } else if (isDate) {
        const formatted = formatCrmDateValueForHebrewDisplay(
          (data[slug] ?? "").trim()
        );
        value = formatted || (raw || EMPTY_PLACEHOLDER);
      } else {
        value = raw || EMPTY_PLACEHOLDER;
      }
      cells.push({
        label: tf.definition.label,
        value,
        colSpan: Math.min(4, Math.max(1, tf.col_span)),
      });
    }
    if (cells.length > 0) {
      out.push({ cells });
    }
  }
  return out;
}
