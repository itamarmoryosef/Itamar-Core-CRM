import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import {
  CLIENT_CRM_STATUS_DOCUMENTS_COMPLETE,
  CLIENT_CRM_STATUS_REMINDER_ELIGIBLE,
  normalizeClientCrmStatus,
} from "@/lib/clientCrmStatus";
import {
  effectiveRequiredDocNames,
  isRequiredDocsCompleteFromDocumentRows,
} from "@/lib/requiredDocuments";
import { buildAdminClientDocumentsFinishedMessage } from "@/lib/appUrls";
import { isWhatsAppConfigured, sendWhatsAppTextMessage } from "@/lib/whatsappSend";
import { getAdminNotificationPhone } from "@/lib/settingsServer";

export const dynamic = "force-dynamic";

/**
 * CRM-only: when the client's required uploads are complete and status was
 * "ממתין למסמכים", advance to "מסמכים הושלמו".
 *
 * Also closes `upload_request_active` and attempts an admin WhatsApp notification
 * when the client confirms that all required documents were uploaded.
 */
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
    .select("id, full_name, short_id, status, required_docs")
    .eq("id", clientId)
    .maybeSingle();

  if (clientErr || !clientRow) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
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

  const currentStatus = normalizeClientCrmStatus(
    (clientRow as { status?: string | null }).status
  );
  const wasWaitingForDocs =
    currentStatus === CLIENT_CRM_STATUS_REMINDER_ELIGIBLE;

  const updatePayload: Record<string, unknown> = {
    upload_request_active: false,
  };
  if (wasWaitingForDocs) {
    updatePayload.status = CLIENT_CRM_STATUS_DOCUMENTS_COMPLETE;
  }
  const { error: upErr } = await admin
    .from("clients")
    .update(updatePayload)
    .eq("id", clientId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const phoneFromDb = await getAdminNotificationPhone(admin);
  const fallback = process.env.ADMIN_NOTIFICATION_PHONE_FALLBACK?.trim() || null;
  const phone = phoneFromDb ?? fallback;
  let notified = false;
  if (phone) {
    if (isWhatsAppConfigured()) {
      const fullName = String(
        (clientRow as { full_name?: string }).full_name ?? "לקוח"
      );
      const rowId = (clientRow as { id: string }).id;
      const message = buildAdminClientDocumentsFinishedMessage(fullName, rowId);
      notified = await sendWhatsAppTextMessage({
        phone,
        text: message,
        logLabel: "portal/documents-complete",
        logMeta: { clientId },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    complete: true,
    statusUpdated: wasWaitingForDocs,
    uploadRequestClosed: true,
    notified,
  });
}
