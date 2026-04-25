function safeDecodePathSegment(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Storage object key as stored in Supabase: no leading slash, forward slashes,
 * no duplicate slashes (avoids 400 / object-not-found from stray formatting).
 * Call again after URL-decoding so `%2F` / pasted public URLs cannot leave `//`.
 */
export function normalizeStorageObjectPath(path: string): string {
  let p = path.trim().replace(/\\/g, "/");
  while (p.startsWith("/")) p = p.slice(1);
  p = p.replace(/\/{2,}/g, "/");
  return p;
}

/** True when the string looks URL-encoded (e.g. `%20`, Hebrew as `%D7%90...`). */
function pathLooksUrlEncoded(path: string): boolean {
  return /%[0-9A-Fa-f]{2}/.test(path);
}

function safeDecodeUrlEncodedStoragePath(path: string): string {
  if (!pathLooksUrlEncoded(path)) return path;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Path as Supabase JS `.download(path)` expects: same literal key as in the bucket,
 * not an HTML-URL copy with `%20` / encoded Hebrew. Normalizes slashes before and after decode.
 */
export function prepareStorageObjectPathForSdk(path: string): string {
  let p = normalizeStorageObjectPath(path);
  p = safeDecodeUrlEncodedStoragePath(p);
  return normalizeStorageObjectPath(p);
}

/**
 * Extract object path inside `bucket` from a Supabase Storage object URL.
 * Handles public, authenticated (private bucket browser URLs), and sign URL path shapes.
 * The returned path is suitable for createSignedUrl / remove (no leading slash).
 */
export function storageObjectPathFromPublicUrl(
  fileUrl: string,
  bucket: string
): string | null {
  try {
    const u = new URL(fileUrl);
    const needles = [
      `/object/public/${bucket}/`,
      `/object/authenticated/${bucket}/`,
      `/object/sign/${bucket}/`,
    ];
    for (const needle of needles) {
      const idx = u.pathname.indexOf(needle);
      if (idx !== -1) {
        const raw = u.pathname.slice(idx + needle.length);
        return normalizeStorageObjectPath(safeDecodePathSegment(raw));
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * When `storageObjectPathFromPublicUrl` returns null (non-standard host/path), try to
 * recover the object key: known `/object/{visibility}/{bucket}/` segments, else the
 * path segment after `/${bucket}/`.
 */
export function fallbackStorageObjectPathFromUrl(
  fileUrl: string,
  bucket: string
): string | null {
  try {
    const u = new URL(fileUrl);
    const path = u.pathname;
    const needles = [
      `/object/public/${bucket}/`,
      `/object/authenticated/${bucket}/`,
      `/object/sign/${bucket}/`,
    ];
    for (const needle of needles) {
      const idx = path.indexOf(needle);
      if (idx !== -1) {
        const raw = path.slice(idx + needle.length);
        return normalizeStorageObjectPath(safeDecodePathSegment(raw));
      }
    }
    const legacy = `/object/${bucket}/`;
    const legIdx = path.indexOf(legacy);
    if (legIdx !== -1) {
      const raw = path.slice(legIdx + legacy.length);
      if (raw)
        return normalizeStorageObjectPath(safeDecodePathSegment(raw));
    }
    const marker = `/${bucket}/`;
    const idx = path.indexOf(marker);
    if (idx !== -1) {
      return normalizeStorageObjectPath(
        safeDecodePathSegment(path.slice(idx + marker.length))
      );
    }
    return null;
  } catch {
    return null;
  }
}

/** Remove duplicate `bucket/` prefix so Supabase SDK receives a single clean key. */
export function stripLeadingBucketFromObjectKey(
  key: string,
  bucket: string
): string {
  const p = normalizeStorageObjectPath(key);
  if (!p) return "";
  if (p === bucket) return "";
  const prefix = `${bucket}/`;
  if (p.startsWith(prefix)) {
    return normalizeStorageObjectPath(p.slice(prefix.length));
  }
  return p;
}

/** Storage object key, or parsed from a Supabase public/sign/authenticated URL. */
export function resolveStorageObjectPathFromMaybeUrl(
  stored: string | null | undefined,
  bucket: string
): string | null {
  const t = stored?.trim();
  if (!t) return null;
  if (t.startsWith("http://") || t.startsWith("https://")) {
    const parsed = storageObjectPathFromPublicUrl(t, bucket);
    return parsed ? normalizeStorageObjectPath(parsed) : null;
  }
  return normalizeStorageObjectPath(t);
}
