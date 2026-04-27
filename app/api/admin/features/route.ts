import { NextRequest, NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { getOrgEnabledFeatureCodes } from "@/lib/getOrgEnabledFeatureCodes";
import { isProfilePlatformSuper } from "@/lib/teamAdmin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Returns enabled feature codes for the org (for menu / gating).
 * - Normal user: their profile.organization_id
 * - Platform super: `?organizationId=` when switching tenant context
 */
export async function GET(req: NextRequest) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin: SupabaseClient;
  try {
    admin = createServiceRoleSupabase();
  } catch {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 }
    );
  }

  const superU = await isProfilePlatformSuper(admin, user.id);
  const { data: prof, error: pe } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (pe) {
    const m = pe.message?.toLowerCase() ?? "";
    if (!/organization_id|column|schema/.test(m)) {
      return NextResponse.json({ error: pe.message }, { status: 500 });
    }
  }

  const profOrg = (prof as { organization_id?: string | null } | null)
    ?.organization_id?.trim() ?? null;

  const q = req.nextUrl.searchParams.get("organizationId")?.trim() ?? null;

  let orgId: string | null = null;
  if (superU) {
    orgId = q || profOrg;
  } else {
    orgId = profOrg;
    if (q && q !== profOrg) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (!orgId) {
    return NextResponse.json(
      { enabledCodes: [] as string[] },
      { status: 200 }
    );
  }

  let enabledCodes: string[] | null;
  try {
    enabledCodes = await getOrgEnabledFeatureCodes(admin, orgId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  if (enabledCodes === null) {
    return NextResponse.json(
      { enabledCodes: null as string[] | null, error: "features_not_installed" },
      { status: 200 }
    );
  }

  return NextResponse.json({ enabledCodes });
}
