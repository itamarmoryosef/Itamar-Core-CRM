/**
 * `clients.required_docs` is a JSON array of Hebrew display names (as in `document_types.name`).
 * Legacy rows may still store English keys or older keys in `documents.doc_type`.
 */

/** Legacy keys → canonical Hebrew name (matches seeded `document_types.name` where applicable). */
export const LEGACY_DOC_KEY_TO_NAME: Record<string, string> = {
  id_card_copy: "צילום תעודת זהות וספח",
  health_declaration: "הצהרה רפואית / דוח רופא",
  /** Legacy `documents.doc_type` only — not implied by empty `required_docs`. */
  exam_proof: "הוכחת עמידה בתבחין",
  military_service: "אישור שירות צבאי/לאומי",
  salary_accountant: "תלושי שכר / אישור רואה חשבון",
  active_reserve: "אישור שירות מילואים פעיל",
  eligible_settlement_proof: "הוכחת מגורים ביישוב זכאי",
};

export function parseRequiredDocNames(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0
    );
  }
  return [];
}

/** Resolves stored entries (name or legacy key) to canonical Hebrew names for matching UI. */
export function normalizeRequiredName(entry: string): string {
  return LEGACY_DOC_KEY_TO_NAME[entry] ?? entry;
}

/**
 * Legacy noise sometimes present in stored `required_docs` — never treat as required uploads.
 * (Lets clients finish when this was removed from the real workflow but not from JSON.)
 */
const EXCLUDED_FROM_REQUIRED_DOCS = new Set([
  "exam_proof",
  "proof_of_criteria",
  "הוכחת עמידה בתבחין",
]);

/**
 * Checklist: `required_docs` from the client row only (normalized legacy keys → Hebrew).
 * Empty/null array means no required uploads — no implicit defaults.
 * Excludes legacy exam-proof entries so they cannot block portal completion.
 */
export function effectiveRequiredDocNames(raw: unknown): string[] {
  return parseRequiredDocNames(raw)
    .map(normalizeRequiredName)
    .filter((name) => !EXCLUDED_FROM_REQUIRED_DOCS.has(name.trim()));
}

/** Add raw `doc_type` from DB plus any legacy alias (e.g. key → Hebrew name). */
export function addDocTypeAliases(set: Set<string>, docType: string): void {
  set.add(docType);
  const mapped = LEGACY_DOC_KEY_TO_NAME[docType];
  if (mapped) set.add(mapped);
}

function addReverseLegacyKeys(set: Set<string>, label: string): void {
  const t = label.trim();
  if (!t) return;
  for (const [key, val] of Object.entries(LEGACY_DOC_KEY_TO_NAME)) {
    if (val.trim() === t) set.add(key);
  }
}

/**
 * All strings that identify the same logical doc type for matching `documents.doc_type`
 * to `required_docs` entries (either may be Hebrew key, legacy English key, or template name).
 */
export function expandDocTypeAliasSet(docType: string): Set<string> {
  const s = new Set<string>();
  const t = docType.trim();
  if (!t) return s;
  addDocTypeAliases(s, t);
  addReverseLegacyKeys(s, t);
  addReverseLegacyKeys(s, normalizeRequiredName(t));
  return s;
}

/** True if a `documents.doc_type` row satisfies a checklist item (Hebrew name or legacy key). */
export function docRowMatchesRequiredDocType(
  storedDocType: string,
  requiredDisplayName: string
): boolean {
  const a = expandDocTypeAliasSet(storedDocType);
  const b = expandDocTypeAliasSet(requiredDisplayName);
  for (const x of a) {
    if (b.has(x)) return true;
  }
  return false;
}

/**
 * Strip legacy excluded keys from stored `required_docs` (e.g. exam noise).
 * Does **not** remove entries just because there is no matching `documents` row yet — the
 * office checklist is the source of truth; pending uploads must stay until unchecked in CRM.
 */
export function stripExcludedRequiredDocKeys(raw: unknown): {
  next: unknown;
  changed: boolean;
} {
  const names = parseRequiredDocNames(raw);
  if (names.length === 0) {
    return { next: raw, changed: false };
  }
  const kept: string[] = [];
  let changed = false;
  for (const entry of names) {
    const displayName = normalizeRequiredName(entry);
    if (EXCLUDED_FROM_REQUIRED_DOCS.has(displayName.trim())) {
      changed = true;
      continue;
    }
    kept.push(entry);
  }
  if (!changed) {
    return { next: raw, changed: false };
  }
  return {
    next: kept.length === 0 ? [] : kept,
    changed: true,
  };
}

/**
 * Other rows for the same logical doc type with no file (placeholders from "new client").
 * Remove these when deleting a real upload so the type does not reappear as an empty row.
 */
export function emptyPlaceholderRowsSameSemanticType<
  T extends {
    id: string;
    doc_type: string;
    file_url?: string | null;
    storage_path?: string | null;
    signed_pdf_storage_path?: string | null;
  },
>(allRows: T[], deletedRow: T): T[] {
  return allRows.filter(
    (row) =>
      row.id !== deletedRow.id &&
      !documentRowHasUpload(row) &&
      docRowMatchesRequiredDocType(row.doc_type, deletedRow.doc_type)
  );
}

/** True if the row represents an actual file in storage (not an empty checklist placeholder). */
export function documentRowHasUpload(row: {
  file_url?: string | null;
  storage_path?: string | null;
  signed_pdf_storage_path?: string | null;
}): boolean {
  return Boolean(
    row.file_url?.trim() ||
      row.storage_path?.trim() ||
      row.signed_pdf_storage_path?.trim()
  );
}

/** Portal signature step writes `signed_pdf_storage_path` (in-place or new row). */
export function isPortalSignedDocumentRow(row: {
  signed_pdf_storage_path?: string | null;
}): boolean {
  return Boolean(row.signed_pdf_storage_path?.trim());
}

/**
 * Required-docs checklist / CRM completeness: real client uploads only.
 * In-place signed rows keep their original `doc_type` — they must not satisfy a required type.
 */
export function documentRowHasRequiredChecklistUpload(row: {
  file_url?: string | null;
  storage_path?: string | null;
  signed_pdf_storage_path?: string | null;
}): boolean {
  if (isPortalSignedDocumentRow(row)) return false;
  return documentRowHasUpload(row);
}

export function normalizedUploadedSets(
  rows: {
    client_id: string;
    doc_type: string;
    file_url?: string | null;
    storage_path?: string | null;
    signed_pdf_storage_path?: string | null;
  }[]
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!documentRowHasRequiredChecklistUpload(r)) continue;
    if (!m.has(r.client_id)) m.set(r.client_id, new Set());
    addDocTypeAliases(m.get(r.client_id)!, r.doc_type);
  }
  return m;
}

/** Display label for a stored `documents.doc_type` value. */
export function labelForDocType(stored: string): string {
  return LEGACY_DOC_KEY_TO_NAME[stored] ?? stored;
}

export function isRequiredDocsComplete(
  requiredNames: string[],
  normalizedUploaded: Set<string>
): boolean {
  if (requiredNames.length === 0) return true;
  return requiredNames.every((n) => normalizedUploaded.has(n));
}

/**
 * Cron/WhatsApp auto reminders: who still needs a nudge to use the portal.
 * - Not signed → always remind (until they complete signature flow).
 * - Signed + empty required_docs → remind only while there is no uploaded file
 *   (avoids spamming once ad-hoc uploads exist without a formal checklist).
 * - Signed + checklist → remind until every required type has a file.
 */
export function needsAutomatedDocumentReminder(
  hasSigned: boolean,
  normalizedUploaded: Set<string>,
  requiredDocsRaw: unknown
): boolean {
  if (!hasSigned) return true;
  const names = effectiveRequiredDocNames(requiredDocsRaw);
  if (names.length === 0) {
    return normalizedUploaded.size === 0;
  }
  return !isRequiredDocsComplete(names, normalizedUploaded);
}

/**
 * Each required type must have at least one matching row, and every matching row must
 * have an uploaded file (supports multiple rows per type, e.g. placeholders from new-client flow).
 */
export function isRequiredDocsCompleteFromDocumentRows(
  requiredNames: string[],
  rows: {
    doc_type: string;
    file_url?: string | null;
    storage_path?: string | null;
    signed_pdf_storage_path?: string | null;
  }[]
): boolean {
  if (requiredNames.length === 0) return true;
  for (const name of requiredNames) {
    const matching = rows.filter(
      (r) =>
        !isPortalSignedDocumentRow(r) &&
        docRowMatchesRequiredDocType(r.doc_type, name)
    );
    if (matching.length === 0) return false;
    if (!matching.every((r) => documentRowHasRequiredChecklistUpload(r)))
      return false;
  }
  return true;
}

/** @deprecated use effectiveRequiredDocNames */
export function effectiveRequiredDocKeys(raw: unknown): string[] {
  return effectiveRequiredDocNames(raw);
}
