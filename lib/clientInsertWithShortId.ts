import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateClientShortId,
  isPostgresUniqueViolation,
} from "@/lib/clientShortId";

const MAX_SHORT_ID_ATTEMPTS = 16;

/**
 * Inserts a client row with a unique short_id (retries on collision).
 */
export async function insertClientWithShortId(
  supabase: SupabaseClient,
  row: Record<string, unknown>
): Promise<{
  data: { id: string } | null;
  error: { message: string; code?: string } | null;
}> {
  for (let attempt = 0; attempt < MAX_SHORT_ID_ATTEMPTS; attempt++) {
    const short_id = generateClientShortId();
    const { data, error } = await supabase
      .from("clients")
      .insert({ ...row, short_id })
      .select("id")
      .single();

    if (!error && data?.id) {
      return { data: { id: data.id as string }, error: null };
    }
    if (error && !isPostgresUniqueViolation(error)) {
      return {
        data: null,
        error: { message: error.message, code: error.code },
      };
    }
  }
  return {
    data: null,
    error: {
      message: "לא ניתן להקצות מזהה קצר ייחודי. נסו שוב.",
    },
  };
}
