import { NextRequest, NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { getOrganizationIdForAdminRequest } from "@/lib/adminOrganizationIdServer";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

type Row = { organization_id: string; id: string };

function jsonErr(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

function parseOrgId(req: NextRequest, body: unknown): string | null {
  if (typeof body === "object" && body !== null) {
    const o = body as Record<string, unknown>;
    if (typeof o.organizationId === "string" && o.organizationId.trim()) {
      return o.organizationId.trim();
    }
  }
  return req.nextUrl.searchParams.get("organizationId")?.trim() || null;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const user = await getRouteSessionUser();
  if (!user) {
    return jsonErr("Unauthorized", 401);
  }
  const id = (await ctx.params).id?.trim() ?? "";
  if (!id) {
    return jsonErr("id required", 400);
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonErr("Invalid JSON", 400);
  }
  const q = parseOrgId(req, body);

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
    return jsonErr("אין ארגון משויך", 400);
  }

  const { data: row, error: fErr } = await admin
    .from("outbound_message_templates")
    .select("id, organization_id")
    .eq("id", id)
    .maybeSingle();

  if (fErr) {
    return jsonErr(fErr.message, 500);
  }
  const r = row as Row | null;
  if (!r) {
    return jsonErr("Not found", 404);
  }
  if (r.organization_id !== orgId) {
    return jsonErr("Forbidden", 403);
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) {
      return jsonErr("name empty", 400);
    }
    update.name = n;
  }
  if (typeof body.body === "string") {
    const t = body.body.trim();
    if (!t) {
      return jsonErr("body empty", 400);
    }
    update.body = t;
  }
  if (typeof body.channel === "string") {
    const c = body.channel.trim();
    if (!["whatsapp", "sms", "both"].includes(c)) {
      return jsonErr("Invalid channel", 400);
    }
    update.channel = c;
  }
  if ("associatedStatusId" in body) {
    const a = body.associatedStatusId;
    if (a === null) {
      update.associated_status_id = null;
    } else if (typeof a === "string" && a.trim()) {
      update.associated_status_id = a.trim();
    } else if (a === "" || a === false) {
      update.associated_status_id = null;
    }
  }
  if (typeof body.isActive === "boolean") {
    update.is_active = body.isActive;
  }
  if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
    update.sort_order = body.sortOrder;
  }

  const { data: out, error: uErr } = await admin
    .from("outbound_message_templates")
    .update(update)
    .eq("id", id)
    .eq("organization_id", orgId)
    .select(
      "id, organization_id, name, body, channel, associated_status_id, is_active, sort_order, source_preset_id, created_at, updated_at"
    )
    .single();

  if (uErr) {
    return jsonErr(uErr.message, 500);
  }
  return NextResponse.json({ template: out }, { status: 200, headers: NO_STORE });
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const user = await getRouteSessionUser();
  if (!user) {
    return jsonErr("Unauthorized", 401);
  }
  const id = (await ctx.params).id?.trim() ?? "";
  if (!id) {
    return jsonErr("id required", 400);
  }
  const q = req.nextUrl.searchParams.get("organizationId")?.trim() || null;
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
    return jsonErr("אין ארגון משויך", 400);
  }

  const { data: delRows, error: dErr } = await admin
    .from("outbound_message_templates")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");

  if (dErr) {
    return jsonErr(dErr.message, 500);
  }
  if (!delRows || delRows.length === 0) {
    return jsonErr("Not found", 404);
  }
  return NextResponse.json({ ok: true as const }, { status: 200, headers: NO_STORE });
}
