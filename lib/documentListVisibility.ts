import { docRowMatchesRequiredDocType } from "@/lib/requiredDocuments";

/** Portal inserts signed PDF rows with this `doc_type` — keep visible in admin for audit/download. */
export const PORTAL_SIGNED_AGREEMENT_DOC_TYPE = "Signed Agreement";

/** Admin-uploaded merged agreement PDF row — same string as `documents.doc_type` in DB. */
export const ADMIN_OFFICE_AGREEMENT_DOC_TYPE = "הסכם PDF מהמשרד";

export type DocumentRowVisibilityInput = {
  doc_type: string;
  needs_signature?: boolean | null;
};

/**
 * Admin + portal lists: show only rows that belong to the required-docs checklist,
 * are marked for portal signature, or are system agreement/signed outputs.
 */
export function isDocumentRowVisibleInClientUi(
  d: DocumentRowVisibilityInput,
  requiredNames: string[],
  officeAgreementDocType: string
): boolean {
  if (d.needs_signature === true) return true;
  const dt = (d.doc_type ?? "").trim();
  if (dt === PORTAL_SIGNED_AGREEMENT_DOC_TYPE) return true;
  const office = officeAgreementDocType.trim();
  if (office && dt === office) return true;
  return requiredNames.some((n) => docRowMatchesRequiredDocType(d.doc_type, n));
}
