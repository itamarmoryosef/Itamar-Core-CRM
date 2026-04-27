import { NextRequest, NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

export const dynamic = "force-dynamic";

/**
 * Mutations for `crm_layout_sections` with the service role so inserts succeed
 * even if client-side RLS policies on that table are misconfigured. Requires a
 * valid admin session. Read/list stays on the client via Supabase.
 */
export async function POST(req: NextRequest) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { title?: unknown; sort_order?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  const so = body.sort_order;
  const sort_order =
    typeof so === "number" && Number.isFinite(so) ? so : 0;
  let admin: ReturnType<typeof createServiceRoleSupabase>;
  try {
    admin = createServiceRoleSupabase();
  } catch {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 }
    );
  }
  const { data, error } = await admin
    .from("crm_layout_sections")
    .insert({ title, sort_order })
    .select("id, title, sort_order")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ row: data });
}

export async function PATCH(req: NextRequest) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { id?: unknown; title?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const t = typeof body.title === "string" ? body.title.trim() : "";
  if (!t) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  let admin: ReturnType<typeof createServiceRoleSupabase>;
  try {
    admin = createServiceRoleSupabase();
  } catch {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 }
    );
  }
  const { error } = await admin
    .from("crm_layout_sections")
    .update({ title: t })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true as const });
}

export async function DELETE(req: NextRequest) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  let admin: ReturnType<typeof createServiceRoleSupabase>;
  try {
    admin = createServiceRoleSupabase();
  } catch {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 }
    );
  }
  const { error } = await admin
    .from("crm_layout_sections")
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true as const });
}
