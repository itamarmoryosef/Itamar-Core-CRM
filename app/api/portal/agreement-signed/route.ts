import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

export const dynamic = "force-dynamic";

/**
 * Legacy hook: the portal no longer notifies the admin here.
 * Admin WhatsApp ("documents complete" style) is sent only from
 * POST /api/portal/submit-application after the client taps "שליחת הבקשה".
 */
type Body = {
  clientId?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clientId =
    typeof body.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  let admin: ReturnType<typeof createServiceRoleSupabase>;
  try {
    admin = createServiceRoleSupabase();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data: row, error: clientErr } = await admin
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();

  if (clientErr || !row) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    notified: false,
  });
}
