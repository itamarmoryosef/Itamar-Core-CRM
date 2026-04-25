import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import {
  needsAutomatedDocumentReminder,
  normalizedUploadedSets,
} from "@/lib/requiredDocuments";
import { ensureClientShortId } from "@/lib/ensureClientShortId";
import {
  whatsappPortalLinkFromShortIdWithMode,
} from "@/lib/appUrls";
import { businessName } from "@/lib/branding";
import { isWhatsAppConfigured, sendWhatsAppTextMessage } from "@/lib/whatsappSend";
import {
  clientAllowsAutomatedReminders,
  CLIENT_CRM_STATUS_DEFAULT,
  parseBotEnabledClientCrmStatuses,
  parseCustomClientCrmStatuses,
} from "@/lib/clientCrmStatus";
import { isAuthorizedCronRequest } from "@/lib/cronRequestAuth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSettingValue } from "@/lib/settingsServer";
import {
  SETTING_KEY_CLIENT_CRM_BOT_ENABLED_STATUSES,
  SETTING_KEY_CLIENT_CRM_STATUSES,
} from "@/lib/settingsKeys";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ISRAEL_TIMEZONE = "Asia/Jerusalem";

/** Wall clock in Israel: used to avoid automated cron sends on Shabbat / at night. Admin UI WhatsApp routes are unaffected. */
function getIsraelWeekdayAndHour(now: Date): { weekdayShort: string; hour: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TIMEZONE,
    weekday: "short",
    hour: "numeric",
    hour12: false,
    hourCycle: "h23",
  });
  let weekdayShort = "";
  let hour = 0;
  for (const p of dtf.formatToParts(now)) {
    if (p.type === "weekday") weekdayShort = p.value;
    if (p.type === "hour") hour = parseInt(p.value, 10) || 0;
  }
  return { weekdayShort, hour };
}

/** Saturday in Jerusalem, or 21:00–07:59 Israel (inclusive bounds per spec: >= 21 or < 8). */
function automatedCronSkipReason(now: Date): "shabbat" | "after_hours" | null {
  const { weekdayShort, hour } = getIsraelWeekdayAndHour(now);
  if (weekdayShort === "Sat") return "shabbat";
  if (hour >= 21 || hour < 8) return "after_hours";
  return null;
}

function cronSupabase(): SupabaseClient {
  /** Cron must use service role: scheduled rows + client phones are not readable with anon under typical RLS. */
  return createServiceRoleSupabase();
}

function buildDocumentReminderMessage(
  fullName: string,
  portalLink: string
): string {
  const org = businessName();
  return [
    `שלום ${fullName},`,
    "",
    `תזכורת מ־${org}. חסרים מסמכים כדי שנוכל להתקדם בטיפול בבקשה שלך.`,
    "להעלאה מהירה ומאובטחת לחצו על הקישור:",
    portalLink,
    "",
    "יום נעים!",
  ].join("\n");
}

/**
 * Auto cadence only. Clients with `reminder_mode = manual` and a due
 * `next_custom_reminder` are handled in a separate cron pass so they still
 * get a ping even when the document checklist is already complete.
 */

function isDocReminderDue(
  row: {
    last_reminder_at?: string | null;
    reminder_mode?: string | null;
  },
  threeDaysAgoIso: string
): boolean {
  const mode = (row.reminder_mode ?? "auto").trim().toLowerCase();
  if (mode === "manual") return false;
  const t = row.last_reminder_at;
  if (t == null) return true;
  return new Date(t) < new Date(threeDaysAgoIso);
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        hint:
          "קרון דורש Authorization: Bearer <CRON_SECRET> או User-Agent של Vercel Cron. אם הגדרתם CRON_SECRET — ודאו שהוא מוגדר גם ב-Cron Job ב-Vercel. שליחה ידנית מהאדמין עוברת ב-/api/whatsapp/* ולא תלויה בזה.",
      },
      { status: 401 }
    );
  }

  const cronRequestUrl = new URL(request.url);
  const forceReminders = cronRequestUrl.searchParams.get("force") === "true";

  const nowForWindow = new Date();
  if (!forceReminders) {
    const skipReason = automatedCronSkipReason(nowForWindow);
    if (skipReason === "shabbat") {
      const { weekdayShort, hour } = getIsraelWeekdayAndHour(nowForWindow);
      console.log(
        "[cron/reminders] Shabbat - skipping reminders",
        JSON.stringify({
          skipped: true,
          reason: "shabbat",
          timezone: ISRAEL_TIMEZONE,
          israelWeekday: weekdayShort,
          israelHour: hour,
        })
      );
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "shabbat",
          message: "Skipped: Shabbat",
          timezone: ISRAEL_TIMEZONE,
        },
        { status: 200 }
      );
    }
    if (skipReason === "after_hours") {
      const { weekdayShort, hour } = getIsraelWeekdayAndHour(nowForWindow);
      console.log(
        "[cron/reminders] After hours - skipping reminders",
        JSON.stringify({
          skipped: true,
          reason: "after_hours",
          timezone: ISRAEL_TIMEZONE,
          israelWeekday: weekdayShort,
          israelHour: hour,
          window: "21:00–08:00",
        })
      );
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "after_hours",
          message: "Skipped: Night time",
          timezone: ISRAEL_TIMEZONE,
        },
        { status: 200 }
      );
    }
  } else {
    console.log(
      "[cron/reminders] Manual override detected - sending reminders regardless of time/day."
    );
  }

  if (!isWhatsAppConfigured()) {
    const msg =
      "WhatsApp service not configured: set WHATSAPP_SERVICE_URL and WHATSAPP_SERVICE_TOKEN and run the bridge";
    console.error(`[cron/reminders] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let supabase: SupabaseClient;
  try {
    supabase = cronSupabase();
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Missing service role configuration";
    console.error("[cron/reminders] cannot create Supabase client", msg);
    return NextResponse.json(
      {
        error: msg,
        hint: "הגדירו ב-Vercel (או בסביבת השרת) את SUPABASE_SERVICE_ROLE_KEY — בלעדיו הקרון לא יכול לקרוא תזמונים ולשלוח הודעות.",
      },
      { status: 500 }
    );
  }

  try {
    const nowMs = Date.now();
    /** UTC ISO string for DB compares (`lte` on timestamptz) and stored timestamps */
    const nowIso = new Date(nowMs).toISOString();
    const threeDaysAgo = new Date(
      nowMs - 3 * 24 * 60 * 60 * 1000
    ).toISOString();
    const crmStatusesRaw =
      (await getSettingValue(supabase, SETTING_KEY_CLIENT_CRM_STATUSES)) ?? "";
    const crmStatuses = parseCustomClientCrmStatuses(crmStatusesRaw);
    const botEnabledStatusesRaw =
      (await getSettingValue(
        supabase,
        SETTING_KEY_CLIENT_CRM_BOT_ENABLED_STATUSES
      )) ?? "";
    const botEnabledStatusSet = new Set(
      parseBotEnabledClientCrmStatuses(botEnabledStatusesRaw, crmStatuses)
    );

    let scheduledProcessed = 0;
    let scheduledFailed = 0;
    let scheduledSkippedPhone = 0;

    const { data: pendingRows, error: pendErr } = await supabase
      .from("client_scheduled_reminders")
      .select("id, client_id, message, scheduled_at, status")
      .eq("status", "pending")
      .lte("scheduled_at", nowIso);

    if (pendErr) {
      console.warn(
        "[cron/reminders] client_scheduled_reminders unavailable",
        pendErr.message
      );
    } else if (pendingRows && pendingRows.length > 0) {
      const clientIds = [
        ...new Set(
          pendingRows.map((r) => String((r as { client_id: string }).client_id))
        ),
      ];
      const { data: clientRows, error: clientPhoneErr } = await supabase
        .from("clients")
        .select("id, phone")
        .in("id", clientIds);
      if (clientPhoneErr) {
        console.error(
          "[cron/reminders] could not load client phones for scheduled reminders — skipping batch (will retry next run)",
          clientPhoneErr.message
        );
      } else {
        const phoneByClientId = new Map<string, string | null>();
        for (const c of clientRows ?? []) {
          const row = c as { id: string; phone: string | null };
          phoneByClientId.set(row.id, row.phone ?? null);
        }

        for (const pr of pendingRows) {
          const row = pr as {
            id: string;
            client_id: string;
            message: string;
          };
          const rid = row.id;
          const cid = row.client_id;
          const text = String(row.message ?? "").trim();
          if (!text) {
            await supabase
              .from("client_scheduled_reminders")
              .update({ status: "cancelled" })
              .eq("id", rid);
            continue;
          }

          const phone = phoneByClientId.get(cid) ?? null;
          if (!phone?.trim()) {
            scheduledSkippedPhone += 1;
            const { error: noPhoneErr } = await supabase
              .from("client_scheduled_reminders")
              .update({ status: "failed" })
              .eq("id", rid);
            if (noPhoneErr) {
              console.warn(
                "[cron/reminders] could not mark scheduled reminder failed (missing phone)",
                noPhoneErr.message
              );
            }
            continue;
          }

          const ok = await sendWhatsAppTextMessage({
            phone,
            text,
            logLabel: "cron/reminders/scheduled",
            logMeta: { reminderId: rid, clientId: cid },
          });

          if (!ok) {
            scheduledFailed += 1;
            const { error: failUp } = await supabase
              .from("client_scheduled_reminders")
              .update({ status: "failed" })
              .eq("id", rid);
            if (failUp) {
              console.warn(
                "[cron/reminders] could not mark scheduled reminder failed after send error",
                failUp.message
              );
            }
            continue;
          }

          const { error: upR } = await supabase
            .from("client_scheduled_reminders")
            .update({
              status: "sent",
              sent_at: nowIso,
            })
            .eq("id", rid);

          if (upR) {
            scheduledFailed += 1;
            console.warn(
              "[cron/reminders] custom scheduled row sent but DB update failed",
              upR.message
            );
            continue;
          }

          const { error: clientUpErr } = await supabase
            .from("clients")
            .update({ last_reminder_at: nowIso })
            .eq("id", cid);

          if (clientUpErr) {
            console.error(
              "[cron/reminders] custom reminder sent but clients.last_reminder_at update failed",
              { clientId: cid, message: clientUpErr.message }
            );
          }

          scheduledProcessed += 1;
        }
      }
    }

    console.log("Processed custom scheduled reminders:", scheduledProcessed);

    let manualClientProcessed = 0;
    let manualClientFailed = 0;
    let manualSkippedNoPhone = 0;
    let manualSkippedCrm = 0;

    const { data: manualDueClients, error: manualDueErr } = await supabase
      .from("clients")
      .select(
        "id, full_name, phone, short_id, status, reminder_mode, next_custom_reminder, upload_request_active"
      )
      .eq("reminder_mode", "manual")
      .eq("upload_request_active", true)
      .not("next_custom_reminder", "is", null)
      .lte("next_custom_reminder", nowIso);

    if (manualDueErr) {
      if (
        manualDueErr.message.includes("reminder_mode") ||
        manualDueErr.message.includes("next_custom_reminder") ||
        manualDueErr.message.includes("reminders_enabled")
      ) {
        return NextResponse.json(
          {
            error: manualDueErr.message,
            hint: manualDueErr.message.includes("reminders_enabled")
              ? "הריצו ב-Supabase את add_client_reminders_enabled.sql"
              : "הריצו ב-Supabase את add_client_reminders_hybrid.sql",
            scheduledProcessed,
            scheduledFailed,
            scheduledSkippedPhone,
          },
          { status: 500 }
        );
      }
      console.warn(
        "[cron/reminders] manual clients query failed",
        manualDueErr.message
      );
    } else if (manualDueClients && manualDueClients.length > 0) {
      for (const client of manualDueClients) {
        const crmStatus =
          (client as { status?: string | null }).status?.trim() ||
          CLIENT_CRM_STATUS_DEFAULT;
        if (!botEnabledStatusSet.has(crmStatus)) {
          manualSkippedCrm += 1;
          continue;
        }

        const phone0 = (client as { phone?: string | null }).phone ?? null;
        if (!phone0?.trim()) {
          manualSkippedNoPhone += 1;
          console.warn(
            "[cron/reminders] skip manual reminder: invalid or missing phone",
            { clientId: (client as { id: string }).id }
          );
          continue;
        }

        const cid = (client as { id: string }).id;
        const shortId = await ensureClientShortId(supabase, cid);
        if (!shortId) {
          manualClientFailed += 1;
          console.warn("[cron/reminders] skip manual reminder: no short_id", {
            clientId: cid,
          });
          continue;
        }

        let portalLink: string;
        try {
          portalLink = whatsappPortalLinkFromShortIdWithMode(
            shortId,
            "documents"
          );
        } catch {
          manualClientFailed += 1;
          continue;
        }

        const fullName = String(
          (client as { full_name?: string | null }).full_name ?? "לקוח"
        );
        const message = buildDocumentReminderMessage(fullName, portalLink);

        console.log(
          "Sending scheduled message to:",
          (client as { full_name?: string | null }).full_name
        );

        const ok = await sendWhatsAppTextMessage({
          phone: phone0,
          text: message,
          logLabel: "cron/reminders",
          logMeta: { clientId: cid },
        });

        if (!ok) {
          manualClientFailed += 1;
          continue;
        }

        const { error: manualUpErr } = await supabase
          .from("clients")
          .update({
            last_reminder_at: nowIso,
            reminder_mode: "auto",
            next_custom_reminder: null,
          })
          .eq("id", cid);

        if (!manualUpErr) manualClientProcessed += 1;
        else manualClientFailed += 1;
      }
    }

    console.log(
      `[cron/reminders] manual client reminders from clients table processed: ${manualClientProcessed}`
    );

    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select(
        "id, full_name, phone, has_signed, last_reminder_at, required_docs, status, short_id, reminder_mode, next_custom_reminder, reminders_enabled, upload_request_active"
      );

    if (clientsError) {
      if (
        clientsError.message.includes("reminder_mode") ||
        clientsError.message.includes("next_custom_reminder") ||
        clientsError.message.includes("reminders_enabled")
      ) {
        return NextResponse.json(
          {
            error: clientsError.message,
            hint: clientsError.message.includes("reminders_enabled")
              ? "הריצו ב-Supabase את add_client_reminders_enabled.sql"
              : "הריצו ב-Supabase את add_client_reminders_hybrid.sql",
            scheduledProcessed,
            scheduledFailed,
            scheduledSkippedPhone,
            manualClientProcessed,
            manualClientFailed,
            manualSkippedNoPhone,
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        {
          error: clientsError.message,
          manualClientProcessed,
          manualClientFailed,
          manualSkippedNoPhone,
        },
        { status: 500 }
      );
    }

    const list = clients ?? [];
    const due = list.filter((c) => {
      if ((c as { upload_request_active?: boolean | null }).upload_request_active !== true) {
        return false;
      }
      if (
        !clientAllowsAutomatedReminders(
          c as { reminders_enabled?: boolean | null }
        )
      ) {
        return false;
      }
      const crmStatus =
        (c as { status?: string | null }).status?.trim() ||
        CLIENT_CRM_STATUS_DEFAULT;
      if (!botEnabledStatusSet.has(crmStatus)) {
        return false;
      }
      return isDocReminderDue(
        c as {
          last_reminder_at?: string | null;
          reminder_mode?: string | null;
        },
        threeDaysAgo
      );
    });

    if (due.length === 0) {
      return NextResponse.json({
        processed: 0,
        dueForReminder: 0,
        actionable: 0,
        skippedNoPhone: 0,
        failedSend: 0,
        scheduledProcessed,
        scheduledFailed,
        scheduledSkippedPhone,
        manualClientProcessed,
        manualClientFailed,
        manualSkippedNoPhone,
        message: "No clients due for document reminders",
      });
    }

    const ids = due.map((c) => c.id);
    const { data: docRows } = await supabase
      .from("documents")
      .select("client_id, doc_type, file_url, storage_path, signed_pdf_storage_path")
      .in("client_id", ids);

    const byClient = normalizedUploadedSets(
      (docRows ?? []) as { client_id: string; doc_type: string }[]
    );

    const actionableClients = due.filter((c) => {
      const row = c as { status?: string | null };
      const crmStatus = row.status?.trim() || CLIENT_CRM_STATUS_DEFAULT;
      if (!botEnabledStatusSet.has(crmStatus)) {
        return false;
      }
      const hasSigned = c.has_signed === true;
      const types = byClient.get(c.id) ?? new Set<string>();
      return needsAutomatedDocumentReminder(
        hasSigned,
        types,
        (c as { required_docs?: unknown }).required_docs
      );
    });

    let processed = 0;
    let skippedNoPhone = 0;
    let failedSend = 0;

    for (const c of actionableClients) {
      if (!c.phone?.trim()) {
        skippedNoPhone += 1;
        console.warn("[cron/reminders] skip client: invalid or missing phone", {
          clientId: c.id,
          phone: c.phone,
        });
        continue;
      }

      const shortId = await ensureClientShortId(supabase, c.id as string);
      if (!shortId) {
        console.warn("[cron/reminders] skip client: no short_id", {
          clientId: c.id,
        });
        failedSend += 1;
        continue;
      }
      let portalLink: string;
      try {
        portalLink = whatsappPortalLinkFromShortIdWithMode(shortId, "documents");
      } catch {
        failedSend += 1;
        continue;
      }
      const message = buildDocumentReminderMessage(
        String(c.full_name ?? "לקוח"),
        portalLink
      );

      const ok = await sendWhatsAppTextMessage({
        phone: c.phone as string | null,
        text: message,
        logLabel: "cron/reminders",
        logMeta: { clientId: c.id as string },
      });

      if (!ok) {
        failedSend += 1;
        continue;
      }

      const { error: upErr } = await supabase
        .from("clients")
        .update({ last_reminder_at: nowIso })
        .eq("id", c.id);

      if (!upErr) processed += 1;
    }

    return NextResponse.json({
      processed,
      dueForReminder: due.length,
      actionable: actionableClients.length,
      skippedNoPhone,
      failedSend,
      scheduledProcessed,
      scheduledFailed,
      scheduledSkippedPhone,
      manualClientProcessed,
      manualClientFailed,
      manualSkippedNoPhone,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[cron/reminders] unhandled error", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
