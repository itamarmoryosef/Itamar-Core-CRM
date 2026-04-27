import { NextRequest, NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { getOrganizationIdForAdminRequest } from "@/lib/adminOrganizationIdServer";
import { getOutboundMessagePreset } from "@/lib/outboundMessagePresets";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

type Row = {
  id: string;
  organization_id: string;
  name: string;
  body: string;
  channel: string;
  associated_status_id: string | null;
  is_active: boolean;
  sort_order: number;
  source_preset_id: string | null;
  created_at: string;
  updated_at: string;
};

function jsonErr(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export async function GET(req: NextRequest) {
  const user = await getRouteSessionUser();
  if (!user) {
    return jsonErr("Unauthorized", 401);
  }
  const qOrg = req.nextUrl.searchParams.get("organizationId")?.trim() || null;
  let admin: SupabaseClient;
  try {
    admin = createServiceRoleSupabase();
  } catch {
    return jsonErr("Server not configured", 500);
  }
  const { orgId, forbidden, profileError } = await getOrganizationIdForAdminRequest(
    admin,
    user.id,
    qOrg
  );
  if (profileError) {
    return jsonErr(profileError, 500);
  }
  if (forbidden) {
    return jsonErr("Forbidden", 403);
  }
  if (!orgId) {
    return NextResponse.json(
      { templates: [] as Row[] },
      { status: 200, headers: NO_STORE }
    );
  }

  const { data, error } = await admin
    .from("outbound_message_templates")
    .select(
      "id, organization_id, name, body, channel, associated_status_id, is_active, sort_order, source_preset_id, created_at, updated_at"
    )
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("does not exist") || m.includes("relation")) {
      return jsonErr("טבלת תבניות — הריצו מיגרציה: migrations/add_outbound_message_templates.sql", 500);
    }
    return jsonErr(error.message, 500);
  }

  return NextResponse.json(
    { templates: (data ?? []) as Row[] },
    { status: 200, headers: NO_STORE }
  );
}

export async function POST(req: NextRequest) {
  const user = await getRouteSessionUser();
  if (!user) {
    return jsonErr("Unauthorized", 401);
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr("Invalid JSON", 400);
  }
  const qFromBody =
    typeof body.organizationId === "string" ? body.organizationId.trim() : null;
  const q = qFromBody || req.nextUrl.searchParams.get("organizationId")?.trim() || null;
  const presetId =
    typeof body.presetId === "string" ? body.presetId.trim() : "";
  const nameIn =
    typeof body.name === "string" ? body.name.trim() : "";
  const bodyIn =
    typeof body.body === "string" ? body.body.trim() : "";
  const channel = typeof body.channel === "string" ? body.channel.trim() : "whatsapp";
  const associatedRaw = body.associatedStatusId;
  const associatedStatusId =
    associatedRaw === null
      ? null
      : typeof associatedRaw === "string" && associatedRaw.trim()
        ? associatedRaw.trim()
        : null;
  if (!["whatsapp", "sms", "both"].includes(channel)) {
    return jsonErr("Invalid channel", 400);
  }

  let name = nameIn;
  let text = bodyIn;
  let sourcePresetId: string | null = null;
  if (presetId) {
    const p = getOutboundMessagePreset(presetId);
    if (!p) {
      return jsonErr("Unknown presetId", 400);
    }
    sourcePresetId = p.id;
    if (!name) name = p.defaultName;
    if (!text) text = p.body;
  }
  if (!name) {
    return jsonErr("name required", 400);
  }
  if (!text) {
    return jsonErr("body required", 400);
  }

  let admin: SupabaseClient;
  try {
    admin = createServiceRoleSupabase();
  } catch {
    return jsonErr("Server not configured", 500);
  }
  const { orgId, forbidden, profileError } = await getOrganizationIdForAdminRequest(
    admin,
    user.id,
    q
  );
  if (profileError) {
    return jsonErr(profileError, 500);
  }
  if (forbidden) {
    return jsonErr("Forbidden", 403);
  }
  if (!orgId) {
    return jsonErr("אין ארגון משויך — הזדהו/הגדירו organization", 400);
  }

  const { data: maxRow, error: maxErr } = await admin
    .from("outbound_message_templates")
    .select("sort_order")
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) {
    const m = maxErr.message.toLowerCase();
    if (m.includes("does not exist") || m.includes("relation")) {
      return jsonErr("טבלת תבניות — הריצו מיגרציה: migrations/add_outbound_message_templates.sql", 500);
    }
    return jsonErr(maxErr.message, 500);
  }
  const nextOrder =
    typeof (maxRow as { sort_order?: number } | null)?.sort_order === "number"
      ? ((maxRow as { sort_order: number }).sort_order + 1)
      : 0;

  const nowIso = new Date().toISOString();
  const { data: row, error: insErr } = await admin
    .from("outbound_message_templates")
    .insert({
      organization_id: orgId,
      name,
      body: text,
      channel,
      associated_status_id: associatedStatusId,
      is_active: true,
      sort_order: nextOrder,
      source_preset_id: sourcePresetId,
      updated_at: nowIso,
    })
    .select(
      "id, organization_id, name, body, channel, associated_status_id, is_active, sort_order, source_preset_id, created_at, updated_at"
    )
    .single();

  if (insErr) {
    if (insErr.message?.includes("associated_status_id")) {
      return jsonErr(insErr.message, 400);
    }
    return jsonErr(insErr.message, 500);
  }

  return NextResponse.json({ template: row as Row }, { status: 201, headers: NO_STORE });
}
