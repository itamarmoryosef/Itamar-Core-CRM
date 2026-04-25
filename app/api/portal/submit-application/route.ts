import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import {
  CLIENT_CRM_STATUS_PORTAL_SUBMITTED,
  isPastPortalApplicationSubmit,
} from "@/lib/clientCrmStatus";
import {
  effectiveRequiredDocNames,
  isRequiredDocsCompleteFromDocumentRows,
} from "@/lib/requiredDocuments";
import { getAdminNotificationPhone } from "@/lib/settingsServer";
import { buildAdminClientDocumentsFinishedMessage } from "@/lib/appUrls";
import { isWhatsAppConfigured, sendWhatsAppTextMessage } from "@/lib/whatsappSend";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { clientId?: string };
  try {
    body = (await request.json()) as { clientId?: string };
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

  const { data: clientRow, error: clientErr } = await admin
    .from("clients")
    .select("id, full_name, status, required_docs, short_id")
    .eq("id", clientId)
    .maybeSingle();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const rawStatus = (clientRow as { status?: string | null }).status;
  if (isPastPortalApplicationSubmit(rawStatus)) {
    return NextResponse.json({
      ok: true,
      submitted: true,
      alreadySubmitted: true,
    });
  }

  const { data: docRows, error: docErr } = await admin
    .from("documents")
    .select("doc_type, file_url, storage_path, signed_pdf_storage_path")
    .eq("client_id", clientId);

  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }

  const required = effectiveRequiredDocNames(
    (clientRow as { required_docs?: unknown }).required_docs
  );
  const complete = isRequiredDocsCompleteFromDocumentRows(
    required,
    (docRows ?? []) as {
      doc_type: string;
      file_url?: string | null;
      storage_path?: string | null;
      signed_pdf_storage_path?: string | null;
    }[]
  );

  if (!complete) {
    return NextResponse.json(
      { error: "Documents not complete", complete: false },
      { status: 400 }
    );
  }

  const { error: upErr } = await admin
    .from("clients")
    .update({ status: CLIENT_CRM_STATUS_PORTAL_SUBMITTED })
    .eq("id", clientId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const phoneFromDb = await getAdminNotificationPhone(admin);
  const fallback = process.env.ADMIN_NOTIFICATION_PHONE_FALLBACK?.trim() || null;
  const phone = phoneFromDb ?? fallback;

  if (!phone) {
    console.warn(
      "[portal/submit-application] No admin_notification_phone — skipping WhatsApp"
    );
    return NextResponse.json({
      ok: true,
      submitted: true,
      notified: false,
      warning: "no_admin_phone",
    });
  }

  if (!isWhatsAppConfigured()) {
    console.warn(
      "[portal/submit-application] WhatsApp bridge not configured — skipping"
    );
    return NextResponse.json({
      ok: true,
      submitted: true,
      notified: false,
      warning: "whatsapp_bridge_missing",
    });
  }

  if (!phone?.trim()) {
    console.warn(
      "[portal/submit-application] admin_notification_phone invalid — skipping",
      { clientId }
    );
    return NextResponse.json({
      ok: true,
      submitted: true,
      notified: false,
      warning: "invalid_phone",
    });
  }

  const fullName = String(
    (clientRow as { full_name?: string }).full_name ?? "לקוח"
  );
  const rowId = (clientRow as { id: string }).id;

  const message = buildAdminClientDocumentsFinishedMessage(fullName, rowId);
  const sent = await sendWhatsAppTextMessage({
    phone,
    text: message,
    logLabel: "portal/submit-application",
    logMeta: { clientId },
  });

  return NextResponse.json({
    ok: true,
    submitted: true,
    notified: sent,
  });
}
