import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { isProfilePlatformSuper } from "@/lib/teamAdmin";

export const dynamic = "force-dynamic";

/**
 * POST { organizationId } — calls public.export_org_data_v2; returns JSON download.
 */
export async function POST(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createServiceRoleSupabase();
  if (!(await isProfilePlatformSuper(admin, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { organizationId?: string };
  try {
    body = (await request.json()) as { organizationId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const organizationId = String(body.organizationId ?? "").trim();
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId required" }, { status: 400 });
  }

  const { data, error } = await admin.rpc("export_org_data_v2", {
    p_organization_id: organizationId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filename = `org-export-${organizationId.slice(0, 8)}-${Date.now()}.json`;
  let json: string;
  if (data == null) {
    json = JSON.stringify(
      { error: "export_org_data_v2 returned null" },
      null,
      2
    );
  } else if (typeof data === "string") {
    const trimmed = data.trim();
    try {
      const parsed: unknown = JSON.parse(trimmed);
      json = JSON.stringify(parsed, null, 2);
    } catch {
      json = trimmed;
    }
  } else {
    json = JSON.stringify(data, null, 2);
  }
  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
