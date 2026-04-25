/**
 * Shared rules for multi-document portal signatures + optional template/custom PDF step.
 */

function rowHasFileForSignature(row: {
  file_url?: string | null;
  storage_path?: string | null;
}): boolean {
  return Boolean(row.file_url?.trim() || row.storage_path?.trim());
}

export type SignatureDocRow = {
  id?: string;
  needs_signature?: boolean | null;
  signature_signed_at?: string | null;
  created_at?: string | null;
  file_url?: string | null;
  storage_path?: string | null;
};

export type ClientSignatureSlice = {
  agreement_request_active?: boolean | null;
  agreement_source?: string | null;
  agreement_custom_pdf_path?: string | null;
  agreement_aux_signed_at?: string | null;
  agreement_template_ids?: string[] | null;
  agreement_template_sign_index?: number | null;
};

export function normalizedAgreementTemplateIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is string => typeof x === "string" && Boolean(x.trim())
  );
}

/**
 * When the office assigned one or more DOCX templates and the auxiliary
 * agreement signature is not finished (`agreement_aux_signed_at` unset),
 * the client still owes template signatures — even if `has_signed` is still
 * true from an earlier round.
 */
export function hasOutstandingTemplateAgreementQueue(
  client: ClientSignatureSlice
): boolean {
  if (client.agreement_request_active === false) return false;
  const ids = normalizedAgreementTemplateIds(client.agreement_template_ids);
  if (ids.length === 0) return false;
  const src = String(client.agreement_source ?? "").trim();
  if (src !== "template" && src !== "") return false;
  return !client.agreement_aux_signed_at?.trim();
}

/** Documents that still require a client signature, oldest first. */
export function pendingSignatureDocuments<T extends SignatureDocRow>(
  docs: T[]
): T[] {
  return docs
    .filter(
      (d) =>
        d.needs_signature === true &&
        !d.signature_signed_at?.trim() &&
        rowHasFileForSignature(d)
    )
    .slice()
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
}

/**
 * After all pending signature-documents are done, does the client still owe
 * a template (DOCX) or office-uploaded custom PDF signature?
 */
export function needsAuxSignatureStep(
  client: ClientSignatureSlice,
  pendingDocumentSignatureCount: number
): boolean {
  if (client.agreement_request_active === false) return false;
  if (pendingDocumentSignatureCount > 0) return false;
  const src = String(client.agreement_source ?? "").trim();
  if (src === "from_document") {
    return false;
  }
  if (src === "custom_pdf" && client.agreement_custom_pdf_path?.trim()) {
    return !client.agreement_aux_signed_at?.trim();
  }
  if (src === "template" || src === "") {
    return !client.agreement_aux_signed_at?.trim();
  }
  return false;
}

export function portalSignatureFullyComplete(
  docs: SignatureDocRow[],
  client: ClientSignatureSlice
): boolean {
  const pending = pendingSignatureDocuments(docs);
  if (pending.length > 0) return false;
  return !needsAuxSignatureStep(client, 0);
}

/** True while the client must stay on the signature-only portal step. */
export function portalSignatureWorkRemaining(
  docs: SignatureDocRow[],
  client: ClientSignatureSlice
): boolean {
  if (client.agreement_request_active === false) return false;
  return !portalSignatureFullyComplete(docs, client);
}
