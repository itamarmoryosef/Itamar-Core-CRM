import { NextRequest, NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { isProfilePlatformSuper } from "@/lib/teamAdmin";

export const dynamic = "force-dynamic";

type Cat = { id: string; code: string; label: string; description: string | null; sort_order: number };

/**
 * GET ?organizationId= — all system features + effective enabled for that org.
 * PUT { organizationId, code, enabled } — upsert flag (super only).
 */
export async function GET(req: NextRequest) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createServiceRoleSupabase();
  if (!(await isProfilePlatformSuper(admin, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = req.nextUrl.searchParams.get("organizationId")?.trim() ?? "";
  if (!orgId) {
    return NextResponse.json(
      { error: "organizationId query required" },
      { status: 400 }
    );
  }

  const { data: catalog, error: ce } = await admin
    .from("system_features")
    .select("id, code, label, description, sort_order")
    .order("sort_order", { ascending: true });
  if (ce) {
    return NextResponse.json({ error: ce.message }, { status: 500 });
  }

  const { data: flags, error: fe } = await admin
    .from("organization_feature_map")
    .select("system_feature_id, enabled")
    .eq("organization_id", orgId);
  if (fe) {
    return NextResponse.json({ error: fe.message }, { status: 500 });
  }

  const fmap = new Map(
    (flags ?? []).map(
      (r) =>
        [r.system_feature_id as string, (r as { enabled: boolean }).enabled] as const
    )
  );
  const features = (catalog ?? []).map((c) => {
    const row = c as Cat;
    const e = fmap.get(row.id);
    const effective = e !== false;
    return {
      id: row.id,
      code: row.code,
      label: row.label,
      description: row.description,
      sort_order: row.sort_order,
      enabled: effective,
    };
  });
  return NextResponse.json({ organizationId: orgId, features });
}

type PutBody = { organizationId: string; code: string; enabled: boolean };

export async function PUT(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createServiceRoleSupabase();
  if (!(await isProfilePlatformSuper(admin, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const organizationId = String(body.organizationId ?? "").trim();
  const code = String(body.code ?? "").trim().toLowerCase();
  if (!organizationId || !code) {
    return NextResponse.json(
      { error: "organizationId and code required" },
      { status: 400 }
    );
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
  }

  const { data: feat, error: e1 } = await admin
    .from("system_features")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (e1 || !feat) {
    return NextResponse.json({ error: "Unknown feature code" }, { status: 400 });
  }
  const systemFeatureId = (feat as { id: string }).id;

  if (body.enabled) {
    const { error: delE } = await admin
      .from("organization_feature_map")
      .delete()
      .eq("organization_id", organizationId)
      .eq("system_feature_id", systemFeatureId);
    if (delE) {
      return NextResponse.json({ error: delE.message }, { status: 500 });
    }
  } else {
    const { error: de } = await admin
      .from("organization_feature_map")
      .delete()
      .eq("organization_id", organizationId)
      .eq("system_feature_id", systemFeatureId);
    if (de) {
      return NextResponse.json({ error: de.message }, { status: 500 });
    }
    const { error: inE } = await admin
      .from("organization_feature_map")
      .insert({
        organization_id: organizationId,
        system_feature_id: systemFeatureId,
        enabled: false,
        updated_at: new Date().toISOString(),
      });
    if (inE) {
      return NextResponse.json({ error: inE.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
