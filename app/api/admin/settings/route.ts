import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import {
  getAdminNotificationPhone,
  getSettingValue,
  upsertSettingValue,
} from "@/lib/settingsServer";
import {
  parseBotEnabledClientCrmStatuses,
  parseCustomClientCrmStatuses,
  serializeClientCrmStatuses,
  CLIENT_CRM_STATUSES_FALLBACK,
} from "@/lib/clientCrmStatus";
import {
  SETTING_KEY_ADMIN_NOTIFICATION_PHONE,
  SETTING_KEY_BRANDING_BUSINESS_NAME,
  SETTING_KEY_BRANDING_LOGO_URL,
  SETTING_KEY_BRANDING_PRIMARY,
  SETTING_KEY_BRANDING_SECONDARY,
  SETTING_KEY_BRANDING_TAGLINE,
  SETTING_KEY_CLIENT_CRM_BOT_ENABLED_STATUSES,
  SETTING_KEY_CLIENT_CRM_BOT_ENABLED_STATUS_IDS,
  SETTING_KEY_CLIENT_CRM_STATUSES,
  SETTING_KEY_GROW_PAYMENT_BASE_URL,
} from "@/lib/settingsKeys";
import { getResolvedBranding, invalidateResolvedBrandingCache } from "@/lib/brandingResolve";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function parseStoredBotEnabledStatusIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Resolves which `client_statuses` rows the bot may target: explicit JSON
 * in settings, or label-based fallback (legacy) mapped through the table.
 */
async function getClientCrmBotEnabledStatusIds(
  admin: SupabaseClient,
  botEnabledStatusesByLabel: string[]
): Promise<string[]> {
  const fromSetting = parseStoredBotEnabledStatusIds(
    await getSettingValue(admin, SETTING_KEY_CLIENT_CRM_BOT_ENABLED_STATUS_IDS)
  );
  if (fromSetting.length > 0) {
    return Array.from(new Set(fromSetting));
  }
  const { data: stRows } = await admin
    .from("client_statuses")
    .select("id, label");
  const byLabel = new Map(
    (stRows ?? []).map((r) => {
      const row = r as { id: string; label: string };
      return [row.label.trim(), row.id] as [string, string];
    })
  );
  const out: string[] = [];
  for (const lab of botEnabledStatusesByLabel) {
    const id = byLabel.get(lab.trim());
    if (id) out.push(id);
  }
  return Array.from(new Set(out));
}

export async function GET() {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createServiceRoleSupabase();
    const phone = await getAdminNotificationPhone(admin);
    const growBase =
      (await getSettingValue(admin, SETTING_KEY_GROW_PAYMENT_BASE_URL)) ?? "";
    const crmStatusesRaw =
      (await getSettingValue(admin, SETTING_KEY_CLIENT_CRM_STATUSES)) ?? "";
    const crmStatuses = parseCustomClientCrmStatuses(crmStatusesRaw);
    const botEnabledRaw =
      (await getSettingValue(admin, SETTING_KEY_CLIENT_CRM_BOT_ENABLED_STATUSES)) ??
      "";
    const botEnabledStatuses = parseBotEnabledClientCrmStatuses(
      botEnabledRaw,
      crmStatuses
    );
    const clientCrmBotEnabledStatusIds = await getClientCrmBotEnabledStatusIds(
      admin,
      botEnabledStatuses
    );
    const rb = await getResolvedBranding();
    return NextResponse.json({
      admin_notification_phone: phone ?? "",
      grow_payment_base_url: growBase,
      client_crm_statuses: crmStatuses,
      client_crm_bot_enabled_statuses: botEnabledStatuses,
      client_crm_bot_enabled_status_ids: clientCrmBotEnabledStatusIds,
      branding_business_name: rb.businessName,
      branding_tagline: rb.tagline,
      branding_primary: rb.primary,
      branding_secondary: rb.secondary,
      branding_logo_url: rb.logoUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    admin_notification_phone?: string;
    grow_payment_base_url?: string;
    client_crm_statuses?: unknown;
    client_crm_bot_enabled_statuses?: unknown;
    client_crm_bot_enabled_status_ids?: unknown;
    branding_business_name?: string;
    branding_tagline?: string;
    branding_primary?: string;
    branding_secondary?: string;
    branding_logo_url?: string;
  };
  try {
    body = (await request.json()) as {
      admin_notification_phone?: string;
      grow_payment_base_url?: string;
      client_crm_statuses?: unknown;
      client_crm_bot_enabled_statuses?: unknown;
      client_crm_bot_enabled_status_ids?: unknown;
      branding_business_name?: string;
      branding_tagline?: string;
      branding_primary?: string;
      branding_secondary?: string;
      branding_logo_url?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasPhone = "admin_notification_phone" in body;
  const hasGrow = "grow_payment_base_url" in body;
  const hasStatuses = "client_crm_statuses" in body;
  const hasBotEnabledStatuses = "client_crm_bot_enabled_statuses" in body;
  const hasBotEnabledStatusIds = "client_crm_bot_enabled_status_ids" in body;
  const hasBranding =
    "branding_business_name" in body ||
    "branding_tagline" in body ||
    "branding_primary" in body ||
    "branding_secondary" in body ||
    "branding_logo_url" in body;
  if (
    !hasPhone &&
    !hasGrow &&
    !hasStatuses &&
    !hasBotEnabledStatuses &&
    !hasBotEnabledStatusIds &&
    !hasBranding
  ) {
    return NextResponse.json(
      { error: "לא נשלחו שדות לעדכון" },
      { status: 400 }
    );
  }

  try {
    const admin = createServiceRoleSupabase();

    if (hasPhone) {
      const raw =
        typeof body.admin_notification_phone === "string"
          ? body.admin_notification_phone.trim()
          : "";
      const { error } = await upsertSettingValue(
        admin,
        SETTING_KEY_ADMIN_NOTIFICATION_PHONE,
        raw
      );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (hasGrow) {
      const raw =
        typeof body.grow_payment_base_url === "string"
          ? body.grow_payment_base_url.trim()
          : "";
      if (raw && !/^https?:\/\//i.test(raw)) {
        return NextResponse.json(
          {
            error:
              "קישור בסיס ל-Grow חייב להתחיל ב-https:// או ב-http:// (או להשאיר ריק).",
          },
          { status: 400 }
        );
      }
      const { error } = await upsertSettingValue(
        admin,
        SETTING_KEY_GROW_PAYMENT_BASE_URL,
        raw
      );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (hasBranding) {
      const ups = async (key: string, val: string) => {
        const { error } = await upsertSettingValue(admin, key, val);
        if (error) {
          return error.message;
        }
        return null;
      };
      if (typeof body.branding_business_name === "string") {
        const m = await ups(SETTING_KEY_BRANDING_BUSINESS_NAME, body.branding_business_name);
        if (m) {
          return NextResponse.json({ error: m }, { status: 500 });
        }
      }
      if (typeof body.branding_tagline === "string") {
        const m = await ups(SETTING_KEY_BRANDING_TAGLINE, body.branding_tagline);
        if (m) {
          return NextResponse.json({ error: m }, { status: 500 });
        }
      }
      if (typeof body.branding_primary === "string") {
        const m = await ups(SETTING_KEY_BRANDING_PRIMARY, body.branding_primary);
        if (m) {
          return NextResponse.json({ error: m }, { status: 500 });
        }
      }
      if (typeof body.branding_secondary === "string") {
        const m = await ups(SETTING_KEY_BRANDING_SECONDARY, body.branding_secondary);
        if (m) {
          return NextResponse.json({ error: m }, { status: 500 });
        }
      }
      if (typeof body.branding_logo_url === "string") {
        const m = await ups(SETTING_KEY_BRANDING_LOGO_URL, body.branding_logo_url);
        if (m) {
          return NextResponse.json({ error: m }, { status: 500 });
        }
      }
      invalidateResolvedBrandingCache();
    }

    const statusesInputRaw = Array.isArray(body.client_crm_statuses)
      ? body.client_crm_statuses
          .filter((v): v is string => typeof v === "string")
          .join("\n")
      : typeof body.client_crm_statuses === "string"
        ? body.client_crm_statuses
        : "";
    const statusesFromDb =
      (await getSettingValue(admin, SETTING_KEY_CLIENT_CRM_STATUSES)) ??
      serializeClientCrmStatuses(CLIENT_CRM_STATUSES_FALLBACK);
    const effectiveStatuses = hasStatuses
      ? parseCustomClientCrmStatuses(statusesInputRaw)
      : parseCustomClientCrmStatuses(statusesFromDb);

    if (hasStatuses) {
      const parsed = effectiveStatuses;
      const value = serializeClientCrmStatuses(parsed);
      const { error } = await upsertSettingValue(
        admin,
        SETTING_KEY_CLIENT_CRM_STATUSES,
        value
      );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (hasBotEnabledStatuses) {
      const rawBotList = Array.isArray(body.client_crm_bot_enabled_statuses)
        ? body.client_crm_bot_enabled_statuses
            .filter((v): v is string => typeof v === "string")
            .join("\n")
        : typeof body.client_crm_bot_enabled_statuses === "string"
          ? body.client_crm_bot_enabled_statuses
          : "";
      const parsed = parseBotEnabledClientCrmStatuses(
        rawBotList,
        effectiveStatuses
      );
      const value = serializeClientCrmStatuses(parsed);
      const { error } = await upsertSettingValue(
        admin,
        SETTING_KEY_CLIENT_CRM_BOT_ENABLED_STATUSES,
        value
      );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (hasBotEnabledStatusIds) {
      const rawIds = body.client_crm_bot_enabled_status_ids;
      const requested = Array.isArray(rawIds)
        ? rawIds
            .filter((v): v is string => typeof v === "string")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      let toStore: string[] = [];
      if (requested.length > 0) {
        const { data: validRows, error: qErr } = await admin
          .from("client_statuses")
          .select("id")
          .in("id", requested);
        if (qErr) {
          return NextResponse.json({ error: qErr.message }, { status: 500 });
        }
        const allowed = new Set(
          (validRows ?? []).map((r) => (r as { id: string }).id)
        );
        toStore = requested.filter((id) => allowed.has(id));
      }
      const { error: idErr } = await upsertSettingValue(
        admin,
        SETTING_KEY_CLIENT_CRM_BOT_ENABLED_STATUS_IDS,
        JSON.stringify(toStore)
      );
      if (idErr) {
        return NextResponse.json({ error: idErr.message }, { status: 500 });
      }
    }

    const phoneOut = hasPhone
      ? typeof body.admin_notification_phone === "string"
        ? body.admin_notification_phone.trim()
        : ""
      : ((await getAdminNotificationPhone(admin)) ?? "");
    const growOut = hasGrow
      ? typeof body.grow_payment_base_url === "string"
        ? body.grow_payment_base_url.trim()
        : ""
      : ((await getSettingValue(admin, SETTING_KEY_GROW_PAYMENT_BASE_URL)) ??
        "");
    const statusesOut = hasStatuses
      ? parseCustomClientCrmStatuses(statusesInputRaw)
      : parseCustomClientCrmStatuses(
          (await getSettingValue(admin, SETTING_KEY_CLIENT_CRM_STATUSES)) ??
            serializeClientCrmStatuses(CLIENT_CRM_STATUSES_FALLBACK)
        );
    const botEnabledOut = hasBotEnabledStatuses
      ? parseBotEnabledClientCrmStatuses(
          Array.isArray(body.client_crm_bot_enabled_statuses)
            ? body.client_crm_bot_enabled_statuses
                .filter((v): v is string => typeof v === "string")
                .join("\n")
            : typeof body.client_crm_bot_enabled_statuses === "string"
              ? body.client_crm_bot_enabled_statuses
              : "",
          statusesOut
        )
      : parseBotEnabledClientCrmStatuses(
          (await getSettingValue(admin, SETTING_KEY_CLIENT_CRM_BOT_ENABLED_STATUSES)) ??
            "",
          statusesOut
        );

    const clientCrmBotEnabledStatusIds = await getClientCrmBotEnabledStatusIds(
      admin,
      botEnabledOut
    );

    const rb = await getResolvedBranding();
    return NextResponse.json({
      ok: true,
      admin_notification_phone: phoneOut,
      grow_payment_base_url: growOut,
      client_crm_statuses: statusesOut,
      client_crm_bot_enabled_statuses: botEnabledOut,
      client_crm_bot_enabled_status_ids: clientCrmBotEnabledStatusIds,
      branding_business_name: rb.businessName,
      branding_tagline: rb.tagline,
      branding_primary: rb.primary,
      branding_secondary: rb.secondary,
      branding_logo_url: rb.logoUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
