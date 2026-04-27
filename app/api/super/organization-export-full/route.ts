import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { isProfilePlatformSuper } from "@/lib/teamAdmin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ORG_FEATURE } from "@/lib/orgFeatureCodes";

export const dynamic = "force-dynamic";

type CatalogRow = { id: string; code: string };
type MapRow = { system_feature_id: string; enabled: boolean };

/**
 * Resolves enabled feature codes (same rules as /api/admin/features).
 */
async function getEnabledFeatureCodes(
  admin: SupabaseClient,
  organizationId: string
): Promise<string[]> {
  const { data: catalog, error: ce } = await admin
    .from("system_features")
    .select("id, code, sort_order")
    .order("sort_order", { ascending: true });
  if (ce) {
    throw new Error(ce.message);
  }
  const { data: mapRows, error: fe } = await admin
    .from("organization_feature_map")
    .select("system_feature_id, enabled")
    .eq("organization_id", organizationId);
  if (fe) {
    throw new Error(fe.message);
  }
  const fset = new Map(
    (mapRows ?? []).map(
      (r) =>
        [r.system_feature_id as string, (r as MapRow).enabled] as const
    )
  );
  const codes: string[] = [];
  for (const c of catalog ?? []) {
    const e = fset.get((c as CatalogRow).id);
    if (e === false) {
      continue;
    }
    codes.push((c as CatalogRow).code);
  }
  return codes;
}

/**
 * JSON export: `export_org_data_v2` + extra tables per enabled feature codes.
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

  let enabledCodes: string[] = [];
  try {
    enabledCodes = await getEnabledFeatureCodes(admin, organizationId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "features query failed" },
      { status: 500 }
    );
  }

  const has = (code: string) => enabledCodes.includes(code);
  const payload: Record<string, unknown> = {
    meta: {
      exported_at: new Date().toISOString(),
      organization_id: organizationId,
      features_enabled: enabledCodes,
    },
  };

  const { data: baseRpc, error: re } = await admin.rpc("export_org_data_v2", {
    p_organization_id: organizationId,
  });
  if (re) {
    return NextResponse.json({ error: re.message }, { status: 500 });
  }
  payload.base = baseRpc;

  if (has(ORG_FEATURE.leadProviders)) {
    const { data, error } = await admin
      .from("lead_providers")
      .select("*")
      .eq("organization_id", organizationId);
    if (!error) {
      payload.lead_providers = data ?? [];
    } else {
      payload.lead_providers = { _error: error.message };
    }
  }

  if (has(ORG_FEATURE.statuses)) {
    const { data, error } = await admin
      .from("client_statuses")
      .select("*")
      .eq("organization_id", organizationId);
    if (!error) {
      payload.client_statuses = data ?? [];
    } else {
      payload.client_statuses = { _error: error.message };
    }
  }

  if (has(ORG_FEATURE.customFields)) {
    const { data: secs, error: sErr } = await admin
      .from("custom_field_sections")
      .select("*")
      .eq("organization_id", organizationId);
    const { data: defs, error: dErr } = await admin
      .from("custom_field_definitions")
      .select("*")
      .eq("organization_id", organizationId);
    payload.custom_field_schema = {
      sections: sErr ? { _error: sErr.message } : (secs ?? []),
      definitions: dErr ? { _error: dErr.message } : (defs ?? []),
    };
  }

  if (has(ORG_FEATURE.settings)) {
    const { data: dts, error: dtE } = await admin
      .from("document_types")
      .select("*");
    payload.document_types = dtE
      ? { _error: dtE.message }
      : (dts ?? []);
  }

  if (has(ORG_FEATURE.team)) {
    const { data: pr, error: prE } = await admin
      .from("profiles")
      .select("id, email, full_name, role, organization_id, created_at, commission_percentage")
      .eq("organization_id", organizationId);
    payload.profiles = prE
      ? { _error: prE.message }
      : (pr ?? []);
  }

  const wantClients =
    has(ORG_FEATURE.revenue) ||
    has(ORG_FEATURE.settings) ||
    has(ORG_FEATURE.customFields) ||
    has(ORG_FEATURE.statuses) ||
    has(ORG_FEATURE.leadProviders);
  if (wantClients) {
    const { data: cl, error: cErr } = await admin
      .from("clients")
      .select("*")
      .eq("organization_id", organizationId);
    if (!cErr) {
      payload.clients = cl ?? [];
      if (has(ORG_FEATURE.customFields) && (cl?.length ?? 0) > 0) {
        const ids = (cl ?? []).map((c) => (c as { id: string }).id);
        const { data: cfv, error: ve } = await admin
          .from("custom_field_values")
          .select("*")
          .in("client_id", ids);
        payload.custom_field_values = ve
          ? { _error: ve.message }
          : (cfv ?? []);
      }
    } else {
      const m = cErr.message.toLowerCase();
      if (m.includes("column") && m.includes("organization_id")) {
        const { data: c2 } = await admin.from("clients").select("*");
        payload.clients = c2 ?? [];
        payload._export_note =
          "clients: organization_id filter not available; included all client rows.";
      } else {
        payload.clients = { _error: cErr.message };
      }
    }
  }

  const json = JSON.stringify(payload, null, 2);
  const filename = `org-full-${organizationId.slice(0, 8)}-${Date.now()}.json`;
  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
