import { normalizeCustomFieldSlugInput } from "@/lib/customFieldsTemplate";

/** ב־Word: `{{custom_…}}`; אחרי normalize — `[[custom_…]]` ל־Docxtemplater. */
export function docxPlaceholderForFieldSlug(slug: string): string {
  const s = normalizeCustomFieldSlugInput(slug);
  return `{{custom_${s || "slug"}}}`;
}
