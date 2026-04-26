import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRouteHandlerSupabase, getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {
  fetchAllClientStatuses,
  sortClientStatusesByOrderAndLabel,
} from "@/lib/clientStatusesAdminQuery";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

export const dynamic = "force-dynamic";

/**
 * CRM list for admin pickers. Tries: service role → same Supabase as logged-in
 * user (cookies) → plain anon server client. Works even without
 * SUPABASE_SERVICE_ROLE_KEY in env (local / misconfigured Vercel).
 */
export async function GET() {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { ...NO_STORE_HEADERS } }
    );
  }

  let db: SupabaseClient;
  try {
    db = createServiceRoleSupabase();
  } catch {
    try {
      db = await getRouteHandlerSupabase();
    } catch {
      try {
        db = createSupabaseServerClient();
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Supabase not configured" },
          { status: 500, headers: { ...NO_STORE_HEADERS } }
        );
      }
    }
  }

  /** `client_statuses` is a single global table in this app — no tenant_id/org_id filter. */
  const { data, error } = await fetchAllClientStatuses(db);
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { ...NO_STORE_HEADERS } }
    );
  }

  return NextResponse.json(
    { statuses: sortClientStatusesByOrderAndLabel(data ?? []) },
    { headers: { ...NO_STORE_HEADERS } }
  );
}
