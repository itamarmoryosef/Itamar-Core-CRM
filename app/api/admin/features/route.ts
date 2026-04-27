import { NextRequest, NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
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

  const { data: catalog, error: ce } = await admin
    .from("system_features")
    .select("id, code, sort_order")
    .order("sort_order", { ascending: true });
  if (ce) {
    const m = ce.message?.toLowerCase() ?? "";
    if (/relation|does not exist|schema/.test(m)) {
      return NextResponse.json(
        { enabledCodes: null as string[] | null, error: "features_not_installed" },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: ce.message }, { status: 500 });
  }

  const { data: flagRows, error: fe } = await admin
    .from("organization_feature_map")
    .select("system_feature_id, enabled")
    .eq("organization_id", orgId);
  if (fe) {
    const m = fe.message?.toLowerCase() ?? "";
    if (/relation|does not exist|schema/.test(m)) {
      return NextResponse.json(
        { enabledCodes: null as string[] | null, error: "features_not_installed" },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: fe.message }, { status: 500 });
  }

  const flagMap = new Map(
    (flagRows ?? []).map(
      (r) =>
        [r.system_feature_id as string, (r as { enabled: boolean }).enabled] as const
    )
  );
  const enabledCodes: string[] = [];
  for (const c of catalog ?? []) {
    const id = c.id as string;
    const code = c.code as string;
    const e = flagMap.get(id);
    if (e === false) {
      continue;
    }
    enabledCodes.push(code);
  }

  return NextResponse.json({ enabledCodes });
}
