/**
 * Template display names (from `templates.name`) that are checked by default
 * in the admin "Create client" flow when they exist as PDF templates.
 */
export const DEFAULT_SIGNATURE_TEMPLATE_NAME_HINTS: readonly string[] = [
  "הסכם שכר טרחה",
  "ייפוי כוח",
];

export function isDefaultPreselectedSignatureTemplate(name: string): boolean {
  const t = name.trim();
  return DEFAULT_SIGNATURE_TEMPLATE_NAME_HINTS.some((h) => t.includes(h));
}
