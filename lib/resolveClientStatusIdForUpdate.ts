const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ClientStatusPickRow = { id: string; label: string };

/**
 * Maps a CRM status `<select>` value to `clients.status_id` (uuid).
 * Accepts a real UUID, or an exact Hebrew label (legacy / stale UI / miswired selects).
 */
export function resolveClientStatusIdForUpdate(
  raw: string,
  statuses: readonly ClientStatusPickRow[]
): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (UUID_RE.test(t)) return t;
  const row = statuses.find((s) => s.label.trim() === t);
  return row?.id ?? null;
}
