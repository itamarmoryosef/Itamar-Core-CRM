import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { supabaseForVerifiedAdminWhatsApp } from "@/lib/supabaseWhatsAppAdmin";
import {
  buildLicenseGrantedReviewMessage,
  getLicenseGrantedReviewPageUrl,
  licenseGrantedReviewStatusMatches,
} from "@/lib/licenseGrantedReviewWhatsApp";
import { isWhatsAppConfigured, sendWhatsAppTextMessage } from "@/lib/whatsappSend";

export const dynamic = "force-dynamic";

const LOG = "[whatsapp/send-license-granted-review]";

/**
 * Admin session: if the client's current CRM label is the configured
 * "license granted / paid" status, send a thank-you + Google review link on WhatsApp.
 */
export async function POST(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    console.warn(LOG, "unauthorized_no_session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = typeof body === "object" && body !== null ? body : null;
  const clientId =
    b &&
    "clientId" in b &&
    typeof (b as { clientId: unknown }).clientId === "string"
      ? (b as { clientId: string }).clientId.trim()
      : "";

  /** Fresh label from admin UI right after save — avoids stale reads on the server. */
  const crmStatusLabelFromClient =
    b &&
    "crmStatusLabel" in b &&
    typeof (b as { crmStatusLabel: unknown }).crmStatusLabel === "string"
      ? (b as { crmStatusLabel: string }).crmStatusLabel.trim()
      : "";

  /** Status UUID chosen in the dropdown — use when DB row is slow to show new `status_id` (e.g. new client). */
  const crmStatusIdFromClient =
    b &&
    "crmStatusId" in b &&
    typeof (b as { crmStatusId: unknown }).crmStatusId === "string"
      ? (b as { crmStatusId: string }).crmStatusId.trim()
      : "";

  if (!clientId) {
    console.warn(LOG, "bad_request_missing_clientId");
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  console.info(LOG, "request", {
    clientId,
    hasCrmStatusLabel: Boolean(crmStatusLabelFromClient),
    hasCrmStatusId: Boolean(crmStatusIdFromClient),
  });

  if (!isWhatsAppConfigured()) {
    return NextResponse.json(
      { error: "WhatsApp bridge is not configured" },
      { status: 500 }
    );
  }

  const supabase = supabaseForVerifiedAdminWhatsApp();
  const { data: client, error: fetchErr } = await supabase
    .from("clients")
    .select("id, full_name, phone, status_id")
    .eq("id", clientId)
    .maybeSingle();

  if (fetchErr) {
    console.error(LOG, "supabase_clients_error", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!client) {
    console.warn(LOG, "client_not_found", { clientId });
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const statusId = (client as { status_id?: string | null }).status_id?.trim();

  const hasAnyStatusHint =
    Boolean(statusId) ||
    Boolean(crmStatusLabelFromClient) ||
    Boolean(crmStatusIdFromClient);
  if (!hasAnyStatusHint) {
    console.warn(LOG, "skipped", { reason: "no_status", clientId });
    return NextResponse.json({ ok: true, skipped: true, reason: "no_status" });
  }

  let label: string | null | undefined;
  if (crmStatusLabelFromClient) {
    label = crmStatusLabelFromClient;
  } else if (crmStatusIdFromClient) {
    const { data: statusRow, error: stErr } = await supabase
      .from("client_statuses")
      .select("label")
      .eq("id", crmStatusIdFromClient)
      .maybeSingle();

    if (stErr) {
      console.error(LOG, "client_statuses_error_by_crm_id", stErr.message);
      return NextResponse.json({ error: stErr.message }, { status: 500 });
    }
    label = (statusRow as { label?: string } | null)?.label;
  } else if (statusId) {
    const { data: statusRow, error: stErr } = await supabase
      .from("client_statuses")
      .select("label")
      .eq("id", statusId)
      .maybeSingle();

    if (stErr) {
      console.error(LOG, "client_statuses_error_by_client_row", stErr.message);
      return NextResponse.json({ error: stErr.message }, { status: 500 });
    }
    label = (statusRow as { label?: string } | null)?.label;
  } else {
    label = undefined;
  }

  if (!licenseGrantedReviewStatusMatches(label)) {
    console.warn(LOG, "skipped", {
      reason: "status_not_license_granted",
      clientId,
      resolvedStatusLabel: label ?? null,
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "status_not_license_granted",
      statusLabel: label ?? null,
    });
  }

  if (!String((client as { phone?: string | null }).phone ?? "").trim()) {
    console.warn(LOG, "skipped_no_valid_phone", { clientId });
    return NextResponse.json(
      { error: "Invalid or missing phone number for WhatsApp" },
      { status: 400 }
    );
  }

  const reviewUrl = getLicenseGrantedReviewPageUrl();
  const message = buildLicenseGrantedReviewMessage(
    String((client as { full_name?: string }).full_name ?? "לקוח"),
    reviewUrl
  );

  const ok = await sendWhatsAppTextMessage({
    phone: (client as { phone: string | null }).phone,
    text: message,
    logLabel: "whatsapp/send-license-granted-review",
    logMeta: { clientId },
  });

  if (!ok) {
    console.error(LOG, "send_failed", { clientId });
    return NextResponse.json(
      { error: "שליחת WhatsApp נכשלה. בדקו את ה-Bridge וה־URL." },
      { status: 502 }
    );
  }

  console.info(LOG, "sent_ok", { clientId });
  return NextResponse.json({ ok: true, sent: true });
}
