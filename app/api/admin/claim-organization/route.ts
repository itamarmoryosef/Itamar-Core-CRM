import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

export const dynamic = "force-dynamic";

/**
 * One-shot: set `profiles.organization_id` to the only row in `public.organizations`
 * when the user has no org. Safe for single-tenant; if multiple orgs exist, return 400.
 * Requires `SUPABASE_SERVICE_ROLE_KEY` on the server.
 */
export async function POST() {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createServiceRoleSupabase();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfiguration";
    return NextResponse.json({ error: msg, code: "NO_SERVICE_ROLE" }, { status: 503 });
  }

  const { data: prof, error: pErr } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  const existing = (prof as { organization_id?: string | null } | null)
    ?.organization_id
    ?.trim();
  if (existing) {
    return NextResponse.json({
      organizationId: existing,
      already: true,
    } satisfies { organizationId: string; already: boolean });
  }

  const { data: orgs, error: oErr } = await admin
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true });
  if (oErr) {
    if (/relation|does not exist|schema/i.test(oErr.message)) {
      return NextResponse.json(
        {
          error: "הטבלה organizations לא קיימת. הרצה: migrations/add_multi_tenancy_organizations.sql",
          code: "NO_ORGANIZATIONS_TABLE",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: oErr.message }, { status: 500 });
  }

  const list = (orgs ?? []) as { id: string }[];
  if (list.length === 0) {
    return NextResponse.json(
      {
        error: "אין ארגון במסד. הריצו את מיגרציית הארגונים (או צרו שורה ב־organizations).",
        code: "NO_ORGS",
      },
      { status: 400 }
    );
  }
  if (list.length > 1) {
    return NextResponse.json(
      {
        error: "מופיעים מספר ארגונים — Super צריך לשייך אתכם, או לבחור במסך ארגונים.",
        code: "MULTIPLE_ORGS",
      },
      { status: 400 }
    );
  }

  const onlyId = list[0]!.id;
  const { error: uErr } = await admin
    .from("profiles")
    .update({ organization_id: onlyId })
    .eq("id", user.id);

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({
    organizationId: onlyId,
    already: false,
  } satisfies { organizationId: string; already: boolean });
}
