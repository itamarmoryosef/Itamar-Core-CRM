import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { isProfilePlatformSuper } from "@/lib/teamAdmin";

export const dynamic = "force-dynamic";

/**
 * Assign a user profile to an organization (platform super only).
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
  let body: { profileId?: string; organizationId?: string | null };
  try {
    body = (await request.json()) as { profileId?: string; organizationId?: string | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const profileId = String(body.profileId ?? "").trim();
  if (!profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }
  if (body.organizationId === null) {
    const { error } = await admin
      .from("profiles")
      .update({ organization_id: null })
      .eq("id", profileId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
  const organizationId = String(body.organizationId ?? "").trim();
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId required" }, { status: 400 });
  }
  const { count } = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .eq("id", organizationId);
  if (count === 0) {
    return NextResponse.json({ error: "Unknown organization" }, { status: 400 });
  }
  const { error } = await admin
    .from("profiles")
    .update({ organization_id: organizationId })
    .eq("id", profileId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
