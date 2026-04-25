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
  SETTING_KEY_CLIENT_CRM_BOT_ENABLED_STATUSES,
  SETTING_KEY_CLIENT_CRM_STATUSES,
  SETTING_KEY_GROW_PAYMENT_BASE_URL,
} from "@/lib/settingsKeys";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({
      admin_notification_phone: phone ?? "",
      grow_payment_base_url: growBase,
      client_crm_statuses: crmStatuses,
      client_crm_bot_enabled_statuses: botEnabledStatuses,
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
  };
  try {
    body = (await request.json()) as {
      admin_notification_phone?: string;
      grow_payment_base_url?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasPhone = "admin_notification_phone" in body;
  const hasGrow = "grow_payment_base_url" in body;
  const hasStatuses = "client_crm_statuses" in body;
  const hasBotEnabledStatuses = "client_crm_bot_enabled_statuses" in body;
  if (!hasPhone && !hasGrow && !hasStatuses && !hasBotEnabledStatuses) {
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

    return NextResponse.json({
      ok: true,
      admin_notification_phone: phoneOut,
      grow_payment_base_url: growOut,
      client_crm_statuses: statusesOut,
      client_crm_bot_enabled_statuses: botEnabledOut,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
