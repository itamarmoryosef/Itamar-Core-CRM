/**
 * Supabase Storage keys must be ASCII; Hebrew or other Unicode in paths causes "Invalid key".
 * Use uuid + extension only in object names; keep the real name in the DB or UI.
 */

/** Zero-width, BOM, bidi overrides — strip so paths and slugs stay stable. */
const INVISIBLE_FILENAME_CHARS =
  /[\u200B-\u200D\uFEFF\u2060\u00AD\u202A-\u202E\u2066-\u2069]/g;

/**
 * Normalize display / DB filename: NFKC, strip invisible chars and controls.
 * Does not remove Hebrew — use for `original_filename` / template `name` only.
 */
export function sanitizeOriginalFilenameForDb(raw: string): string {
  let s = raw.normalize("NFKC").replace(INVISIBLE_FILENAME_CHARS, "");
  s = s.replace(/^[\uFEFF\u200B]+/, "").trim();
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return s.slice(0, 512);
}

/**
 * ASCII-only slug segment for storage object names (no spaces; safe chars only).
 */
export function sanitizeAsciiStorageSlug(fromOriginalBase: string): string {
  let base = fromOriginalBase.normalize("NFKC").replace(INVISIBLE_FILENAME_CHARS, "");
  base = base.trim().replace(/\.[^./\\]+$/i, "");
  base = base.replace(/\s+/g, "_");
  const slug = base
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return slug || "file";
}

export function storageFileExtension(originalFileName: string): string {
  const n = originalFileName.trim();
  const lastDot = n.lastIndexOf(".");
  if (lastDot < 0 || lastDot === n.length - 1) return "bin";
  let ext = n.slice(lastDot + 1).toLowerCase();
  ext = ext.replace(/[^a-z0-9]/g, "");
  if (ext.length === 0 || ext.length > 16) return "bin";
  return ext;
}

/** Object name only (no folder), e.g. "550e8400-e29b-41d4-a716-446655440000.pdf" */
export function randomStorageObjectName(originalFileName: string): string {
  return `${crypto.randomUUID()}.${storageFileExtension(originalFileName)}`;
}

/**
 * ASCII-safe object name: timestamp + short slug from original + extension.
 * Avoids overwriting; keeps a trace of the original filename for admins.
 */
export function timestampedStorageObjectName(originalFileName: string): string {
  const ext = storageFileExtension(originalFileName);
  const cleaned = sanitizeOriginalFilenameForDb(originalFileName);
  const part = sanitizeAsciiStorageSlug(cleaned);
  return `${Date.now()}_${part}.${ext}`;
}

/** Folder segment under client prefix: timestamp + uuid so parallel uploads never collide. */
export function uniqueDocumentsUploadFolderSegment(): string {
  return `${Date.now()}_${crypto.randomUUID()}`;
}
