import type { TemplateFieldRow } from "@/lib/agreementFormTemplateLayout";

/**
 * @param assigned — null/undefined: show all template fields. Non-empty: only these definition_ids.
 * Empty array: show no fields (admin should avoid; treat as "none assigned").
 */
export function filterTemplateFieldsByAssignment(
  fields: TemplateFieldRow[],
  assigned: string[] | null | undefined
): TemplateFieldRow[] {
  if (assigned == null) return fields;
  const set = new Set(assigned.map((x) => String(x).trim()).filter(Boolean));
  if (set.size === 0) return [];
  return fields.filter((f) => set.has(String(f.definition_id).trim()));
}
