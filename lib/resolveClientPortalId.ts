import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {
  isClientUuidParam,
  isValidShortIdParam,
} from "@/lib/clientShortId";

/**
 * Resolves `/portal/[param]` or `/client/[param]` to internal client UUID.
 * Accepts full UUID (legacy links) or 6-char short_id.
 */
export async function resolveClientUuidForPortal(
  raw: string
): Promise<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (isClientUuidParam(trimmed)) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("clients")
      .select("id")
      .eq("id", trimmed)
      .maybeSingle();
    if (error || !data?.id) return null;
    return data.id as string;
  }

  const short = trimmed.toLowerCase();
  if (!isValidShortIdParam(short)) return null;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("short_id", short)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id as string;
}
