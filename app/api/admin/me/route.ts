import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { isProfileTeamAdmin } from "@/lib/teamAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessionUser = await getRouteSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ teamAdmin: false }, { status: 401 });
  }

  try {
    const adminClient = createServiceRoleSupabase();
    const teamAdmin = await isProfileTeamAdmin(adminClient, sessionUser.id);
    return NextResponse.json({ teamAdmin });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config error";
    return NextResponse.json({ teamAdmin: false, error: msg }, { status: 500 });
  }
}
