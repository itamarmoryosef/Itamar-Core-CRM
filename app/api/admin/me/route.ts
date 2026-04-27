import { NextResponse } from "next/server";
import { getRouteHandlerSupabase, getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isProfilePlatformSuper,
  isProfileTeamAdmin,
} from "@/lib/teamAdmin";
import { parseOrganizationBranding } from "@/lib/orgBranding";

export const dynamic = "force-dynamic";

export type AdminMeOrganization = {
  id: string;
  name: string;
  slug: string;
  brand_name: string;
  logo_url: string | null;
  primary_color: string;
  whatsapp_enabled: boolean;
};

export type AdminMeResponse = {
  teamAdmin: boolean;
  platformSuper: boolean;
  organizationId: string | null;
  organization: AdminMeOrganization | null;
};

export async function GET() {
  const sessionUser = await getRouteSessionUser();
  if (!sessionUser) {
    return NextResponse.json(
      { teamAdmin: false, platformSuper: false, organizationId: null, organization: null } satisfies AdminMeResponse,
      { status: 401 }
    );
  }

  try {
    let adminClient: SupabaseClient;
    try {
      adminClient = createServiceRoleSupabase();
    } catch {
      adminClient = await getRouteHandlerSupabase();
    }

    const [teamAdmin, platformSuper, profileRes] = await Promise.all([
      isProfileTeamAdmin(adminClient, sessionUser.id),
      isProfilePlatformSuper(adminClient, sessionUser.id),
      adminClient
        .from("profiles")
        .select("organization_id")
        .eq("id", sessionUser.id)
        .maybeSingle(),
    ]);
    const profileErr = profileRes.error;
    if (profileErr) {
      const m = profileErr.message?.toLowerCase() ?? "";
      if (!/organization_id|column|schema|does not exist/.test(m)) {
        throw profileErr;
      }
    }
    const orgId = profileErr
      ? null
      : (profileRes.data as { organization_id?: string | null } | null)
          ?.organization_id
          ?.trim() ?? null;
    const orgQ = orgId
      ? await adminClient
          .from("organizations")
          .select("id, name, slug, branding_settings")
          .eq("id", orgId)
          .maybeSingle()
      : { data: null, error: null as null };
    if (orgQ.error) {
      const m = orgQ.error.message?.toLowerCase() ?? "";
      if (!/relation|does not exist|column|schema|organization/.test(m)) {
        throw orgQ.error;
      }
    }
    const orgRow = orgQ.data as
      | {
          id: string;
          name: string;
          slug: string;
          branding_settings?: unknown;
        }
      | null;
    const parsed = orgRow
      ? parseOrganizationBranding({
          name: orgRow.name,
          branding_settings: orgRow.branding_settings,
        })
      : null;
    const organization: AdminMeOrganization | null =
      orgRow && parsed
        ? {
            id: orgRow.id,
            name: orgRow.name,
            slug: orgRow.slug,
            brand_name: parsed.brand_name,
            logo_url: parsed.logo_url,
            primary_color: parsed.primary_color,
            whatsapp_enabled: parsed.whatsapp_enabled,
          }
        : null;
    return NextResponse.json({
      teamAdmin,
      platformSuper,
      organizationId: orgId ?? null,
      organization,
    } satisfies AdminMeResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config error";
    return NextResponse.json(
      {
        teamAdmin: false,
        platformSuper: false,
        organizationId: null,
        organization: null,
        error: msg,
      },
      { status: 500 }
    );
  }
}
