import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

export const dynamic = "force-dynamic";

const DEFAULT_PIPELINE: { label: string; color_hex: string; sort_order: number }[] =
  [
    { label: "חדש", color_hex: "#64748b", sort_order: 0 },
    { label: "בטיפול", color_hex: "#3b82f6", sort_order: 1 },
    { label: "ממתין למסמכים", color_hex: "#0ea5e9", sort_order: 2 },
    { label: "ממתין לחתימה", color_hex: "#f59e0b", sort_order: 3 },
    { label: "הושלם", color_hex: "#22c55e", sort_order: 4 },
  ];

/**
 * Seeds recommended CRM statuses when the pipeline is empty (admin only).
 */
export async function POST() {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createServiceRoleSupabase();
    const { count, error: countErr } = await admin
      .from("client_statuses")
      .select("*", { count: "exact", head: true });
    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "כבר קיימים סטטוסים במערכת. ניתן למחוק אותם ידנית לפני טעינה מחדש." },
        { status: 409 }
      );
    }

    const rows = DEFAULT_PIPELINE.map((r) => ({
      label: r.label,
      color_hex: r.color_hex,
      sort_order: r.sort_order,
      is_system: false,
    }));

    const { error: insErr } = await admin.from("client_statuses").insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
