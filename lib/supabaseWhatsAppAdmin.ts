import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DB client for admin WhatsApp route handlers after `getRouteSessionUser()` succeeds.
 * Prefers the service role so `clients` / `templates` reads and `short_id` updates work
 * under RLS; falls back to the anon server client only if the role key is missing (local dev).
 */
export function supabaseForVerifiedAdminWhatsApp(): SupabaseClient {
  try {
    return createServiceRoleSupabase();
  } catch {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[supabaseWhatsAppAdmin] Missing SUPABASE_SERVICE_ROLE_KEY — admin WhatsApp routes fall back to anon and may fail under RLS."
      );
    }
    return createSupabaseServerClient();
  }
}
