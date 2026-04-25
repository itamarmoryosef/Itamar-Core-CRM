import {
  docRowMatchesRequiredDocType,
  documentRowHasUpload,
} from "@/lib/requiredDocuments";
import { normalizedAgreementTemplateIds } from "@/lib/portalSignatureState";

type RemainingRow = {
  doc_type: string;
  needs_signature?: boolean | null;
  file_url?: string | null;
  storage_path?: string | null;
  signed_pdf_storage_path?: string | null;
};

/**
 * When a signature document row is removed, keep `clients` in sync so the admin
 * card does not still show selected templates / active agreement request.
 */
export function buildClientPatchAfterSignatureDocumentDeleted(
  client: {
    agreement_template_ids?: unknown;
    agreement_template_sign_index?: number | null;
    agreement_source?: string | null;
    agreement_request_active?: boolean | null;
    agreement_custom_pdf_path?: string | null;
    agreement_custom_pdf_filename?: string | null;
  },
  deletedRow: { doc_type: string; needs_signature?: boolean | null },
  remainingRows: RemainingRow[],
  agreementTemplates: { id: string; name: string }[]
): Record<string, unknown> | null {
  if (deletedRow.needs_signature !== true) return null;

  const sigLeft = remainingRows.some(
    (r) => r.needs_signature === true && documentRowHasUpload(r)
  );

  if (!sigLeft) {
    return {
      agreement_request_active: false,
      agreement_source: null,
      agreement_custom_pdf_path: null,
      agreement_custom_pdf_filename: null,
      agreement_template_ids: null,
      agreement_template_sign_index: 0,
    };
  }

  const matchedTpl = agreementTemplates.find((t) =>
    docRowMatchesRequiredDocType(deletedRow.doc_type, t.name)
  );
  if (!matchedTpl) return null;

  const ids = normalizedAgreementTemplateIds(client.agreement_template_ids);
  const nextIds = ids.filter((id) => id !== matchedTpl.id);
  if (nextIds.length === ids.length) return null;

  const patch: Record<string, unknown> = {
    agreement_template_ids: nextIds.length === 0 ? null : nextIds,
  };
  const idx = client.agreement_template_sign_index ?? 0;
  if (nextIds.length === 0) {
    patch.agreement_template_sign_index = 0;
  } else if (idx >= nextIds.length) {
    patch.agreement_template_sign_index = nextIds.length - 1;
  }
  return patch;
}
