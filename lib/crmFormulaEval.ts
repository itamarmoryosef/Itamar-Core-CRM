import type { TemplateFieldRow } from "@/lib/agreementFormTemplateLayout";
import { normalizeCrmFieldType } from "@/lib/crmFieldLayout";
import { normalizeCustomFieldSlugInput } from "@/lib/customFieldsTemplate";

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;

function slugFromPlaceholderInner(inner: string): string {
  const key = inner.trim();
  const slugPart = key.toLowerCase().startsWith("custom_")
    ? key.slice("custom_".length).trim()
    : key;
  return normalizeCustomFieldSlugInput(slugPart);
}

/**
 * Evaluates a CRM formula: replaces `{{slug}}` / `{{custom_slug}}` with numeric
 * values from `values`, then safely evaluates the arithmetic expression.
 */
export function evaluateCrmFormula(
  formula: string | null | undefined,
  values: Record<string, string>
): string {
  if (!formula?.trim()) return "";
  const expr = formula.replace(TOKEN, (_, inner: string) => {
    const normalized = slugFromPlaceholderInner(String(inner));
    const raw = (values[normalized] ?? "")
      .trim()
      .replace(/,/g, ".");
    const n = parseFloat(raw);
    return Number.isFinite(n) ? String(n) : "0";
  });
  const trimmed = expr.trim();
  if (!trimmed) return "";
  if (!/^[\d\s+\-*/().]+$/.test(trimmed)) return "";
  try {
    const result = Function(`"use strict"; return (${trimmed})`)();
    if (typeof result === "number" && Number.isFinite(result)) {
      return String(Math.round(result * 1e6) / 1e6);
    }
  } catch {
    /* ignore */
  }
  return "";
}

/** Merges calculated field values into a draft (multi-pass for chained calcs). */
export function applyCalculationsToDraft(
  draft: Record<string, string>,
  fields: TemplateFieldRow[]
): Record<string, string> {
  const out = { ...draft };
  const calcFields = fields.filter(
    (f) => normalizeCrmFieldType(f.definition.field_type) === "calculation"
  );
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const tf of calcFields) {
      const slug = tf.definition.slug;
      const formula = tf.definition.formula;
      const next = evaluateCrmFormula(formula, out);
      if ((out[slug] ?? "") !== next) {
        out[slug] = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}
