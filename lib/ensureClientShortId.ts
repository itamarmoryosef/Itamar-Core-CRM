import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateClientShortId,
  isPostgresUniqueViolation,
  isValidShortIdParam,
} from "@/lib/clientShortId";

/**
 * Ensures the client has a valid 6-char `short_id` for public portal URLs.
 * Safe under concurrency: after each update attempt, refetches until valid.
 */
export async function ensureClientShortId(
  supabase: SupabaseClient,
  clientId: string
): Promise<string | null> {
  const id = clientId.trim();
  if (!id) return null;

  async function loadSid(): Promise<string> {
    const { data, error } = await supabase
      .from("clients")
      .select("short_id")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return "";
    const raw = (data as { short_id?: string | null }).short_id;
    if (raw == null || typeof raw !== "string") return "";
    return raw.trim().toLowerCase();
  }

  let existing = await loadSid();
  if (isValidShortIdParam(existing)) return existing;

  const onlyIfNull = existing === "";

  for (let attempt = 0; attempt < 16; attempt++) {
    const sid = generateClientShortId();

    let error: { code?: string; message?: string } | null = null;
    if (onlyIfNull) {
      const r = await supabase
        .from("clients")
        .update({ short_id: sid })
        .eq("id", id)
        .is("short_id", null);
      error = r.error;
    } else {
      const r = await supabase
        .from("clients")
        .update({ short_id: sid })
        .eq("id", id);
      error = r.error;
    }

    if (error && !isPostgresUniqueViolation(error)) {
      console.error("[ensureClientShortId] update failed", error);
      return null;
    }

    existing = await loadSid();
    if (isValidShortIdParam(existing)) return existing;
  }

  return isValidShortIdParam(existing) ? existing : null;
}
