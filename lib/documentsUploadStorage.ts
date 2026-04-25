import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fallbackStorageObjectPathFromUrl,
  normalizeStorageObjectPath,
  prepareStorageObjectPathForSdk,
  storageObjectPathFromPublicUrl,
  stripLeadingBucketFromObjectKey,
} from "@/lib/storagePublicUrl";

export const DOCUMENTS_UPLOAD_BUCKET = "documents-uploads";

/** Signed PDF outputs from the client portal (per-document or declaration). */
export const DOCUMENTS_SIGNED_BUCKET = "documents-signed";

function pushUnique(keys: string[], candidate: string | null | undefined): void {
  const t = candidate?.trim();
  if (!t) return;
  if (!keys.includes(t)) keys.push(t);
}

/**
 * Ordered keys to try for `.download()` when DB path / public URL may not match
 * the literal object key (encoding, duplicate bucket prefix, legacy URL shapes).
 */
export function documentsUploadDownloadCandidates(
  storagePath: string | null | undefined,
  fileUrl: string | null | undefined
): string[] {
  const keys: string[] = [];

  const addRawKeyVariants = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    pushUnique(keys, prepareStorageObjectPathForSdk(trimmed));
    pushUnique(keys, normalizeStorageObjectPath(trimmed));
    for (const bucket of [DOCUMENTS_UPLOAD_BUCKET, DOCUMENTS_SIGNED_BUCKET]) {
      const strippedPrep = stripLeadingBucketFromObjectKey(
        prepareStorageObjectPathForSdk(trimmed),
        bucket
      );
      pushUnique(keys, strippedPrep);
      const strippedNorm = stripLeadingBucketFromObjectKey(
        normalizeStorageObjectPath(trimmed),
        bucket
      );
      pushUnique(keys, strippedNorm);
    }
  };

  const sp = storagePath?.trim();
  if (sp?.startsWith("http://") || sp?.startsWith("https://")) {
    for (const bucket of [DOCUMENTS_UPLOAD_BUCKET, DOCUMENTS_SIGNED_BUCKET]) {
      const parsed =
        storageObjectPathFromPublicUrl(sp, bucket) ??
        fallbackStorageObjectPathFromUrl(sp, bucket);
      if (parsed) addRawKeyVariants(parsed);
    }
  } else if (sp) {
    addRawKeyVariants(sp);
  }

  const url = fileUrl?.trim();
  if (url) {
    for (const bucket of [DOCUMENTS_UPLOAD_BUCKET, DOCUMENTS_SIGNED_BUCKET]) {
      const parsed =
        storageObjectPathFromPublicUrl(url, bucket) ??
        fallbackStorageObjectPathFromUrl(url, bucket);
      if (parsed) addRawKeyVariants(parsed);
    }
  }

  return keys.filter(Boolean);
}

/**
 * Prefer first candidate (prepared path). Used for remove() and single-key call sites.
 */
export function resolveDocumentsUploadStoragePath(
  storagePath: string | null | undefined,
  fileUrl: string | null | undefined
): string | null {
  const c = documentsUploadDownloadCandidates(storagePath, fileUrl);
  return c[0] ?? null;
}

type PortalDocBucket =
  | typeof DOCUMENTS_UPLOAD_BUCKET
  | typeof DOCUMENTS_SIGNED_BUCKET;

const PORTAL_DOC_BUCKETS_DEFAULT: readonly [PortalDocBucket, PortalDocBucket] = [
  DOCUMENTS_UPLOAD_BUCKET,
  DOCUMENTS_SIGNED_BUCKET,
];

/** Basename starts with `signed_` and ends with `.pdf` — portal output lives in documents-signed. */
function keyLooksLikePortalSignedPdfObject(key: string): boolean {
  const base = (key.split("/").pop() ?? key).trim();
  if (!base) return false;
  return /^signed_/i.test(base) && /\.pdf$/i.test(base);
}

function portalDocBucketsForKey(
  key: string
): readonly [PortalDocBucket, PortalDocBucket] {
  if (keyLooksLikePortalSignedPdfObject(key)) {
    return [DOCUMENTS_SIGNED_BUCKET, DOCUMENTS_UPLOAD_BUCKET];
  }
  return PORTAL_DOC_BUCKETS_DEFAULT;
}

/**
 * Download a portal `documents` row source file: try `documents-uploads` and
 * `documents-signed` (paths like `signed_*.pdf` try the signed bucket first).
 */
export async function downloadDocumentsUploadBlob(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
  fileUrl: string | null | undefined
): Promise<{
  data: Blob | null;
  error: { message: string } | null;
  triedKeys: string[];
  usedKey: string | null;
}> {
  const triedKeys = documentsUploadDownloadCandidates(storagePath, fileUrl);
  if (triedKeys.length === 0) {
    return {
      data: null,
      error: { message: "אין נתיב אחסון או כתובת קובץ" },
      triedKeys: [],
      usedKey: null,
    };
  }

  let lastMessage = "Object not found";
  for (const key of triedKeys) {
    for (const bucket of portalDocBucketsForKey(key)) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(key);
      if (!error && data) {
        return { data, error: null, triedKeys, usedKey: key };
      }
      if (error?.message) lastMessage = error.message;
    }
  }

  for (const key of triedKeys) {
    for (const bucket of portalDocBucketsForKey(key)) {
      const { data: signed, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(key, 120);
      if (signErr || !signed?.signedUrl) {
        if (signErr?.message) lastMessage = signErr.message;
        continue;
      }
      try {
        const res = await fetch(signed.signedUrl);
        if (res.ok) {
          const blob = await res.blob();
          return { data: blob, error: null, triedKeys, usedKey: key };
        }
        lastMessage = `signed fetch ${res.status}`;
      } catch (e) {
        lastMessage = e instanceof Error ? e.message : "fetch failed";
      }
    }
  }

  return {
    data: null,
    error: { message: lastMessage },
    triedKeys,
    usedKey: null,
  };
}
