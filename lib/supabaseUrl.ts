/**
 * Project URL for Supabase (Auth + REST) — must be only origin, no /rest/v1 or trailing junk.
 * Wrong URLs cause: "Invalid path specified in request URL" on sign-in.
 */
export function normalizeSupabaseProjectUrl(raw: string | undefined): string {
  const t = (raw ?? "").trim().replace(/\/+$/, "");
  if (!t) return "";
  try {
    const u = new URL(t);
    if (!u.hostname) return "";
    // https://xxxx.supabase.co  — no path, no query
    return u.origin;
  } catch {
    return "";
  }
}
