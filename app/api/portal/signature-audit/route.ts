import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

export const dynamic = "force-dynamic";

function clientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const p = xf.split(",")[0]?.trim();
    if (p) return p;
  }
  const r = request.headers.get("x-real-ip")?.trim();
  if (r) return r;
  return "unknown";
}

type Body = {
  shortId?: string;
  userAgent?: string;
};

/**
 * Stamps server-side IP / UA after a portal signature. Called from the browser after successful sign.
 * Verifies `shortId` against DB before update.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const shortId =
    typeof body.shortId === "string" ? body.shortId.trim().toLowerCase() : "";
  if (shortId.length !== 6 || !/^[a-z0-9]{6}$/.test(shortId)) {
    return NextResponse.json({ error: "Invalid shortId" }, { status: 400 });
  }
  const ua = typeof body.userAgent === "string" ? body.userAgent.slice(0, 2000) : null;

  let admin;
  try {
    admin = createServiceRoleSupabase();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "config";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data: row, error: qe } = await admin
    .from("clients")
    .select("id")
    .eq("short_id", shortId)
    .maybeSingle();
  if (qe || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ip = clientIp(request);
  const patch: Record<string, string | null> = { signature_client_ip: ip };
  if (ua) patch.signature_user_agent = ua;

  const { error: ue } = await admin
    .from("clients")
    .update(patch)
    .eq("id", row.id as string);
  if (ue) {
    if (/does not exist/i.test(ue.message) || /column/.test(ue.message)) {
      return NextResponse.json(
        { ok: true, skipped: "migration", detail: ue.message },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: ue.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ip });
}
