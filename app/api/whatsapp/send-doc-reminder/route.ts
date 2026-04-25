import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { ensureClientShortId } from "@/lib/ensureClientShortId";
import { supabaseForVerifiedAdminWhatsApp } from "@/lib/supabaseWhatsAppAdmin";
import { whatsappPortalLinkFromShortIdWithMode } from "@/lib/appUrls";
import { businessName } from "@/lib/branding";
import { isWhatsAppConfigured, sendWhatsAppTextMessage } from "@/lib/whatsappSend";

export const dynamic = "force-dynamic";

/**
 * Admin-only: per-document WhatsApp ping. Intentionally does **not** enforce
 * `clients.status` or `reminders_enabled` — those gates apply only to the
 * automated cron job in `/api/cron/reminders`.
 */
function buildDocReminderMessage(
  fullName: string,
  docName: string,
  portalLink: string
): string {
  const org = businessName();
  return [
    `שלום ${fullName},`,
    "",
    `תזכורת מ־${org}: חסר המסמך "${docName}" במערכת.`,
    "העלאה בקישור:",
    portalLink,
    "",
    "תודה,",
    org,
  ].join("\n");
}

export async function POST(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { clientId?: string; missingDocName?: string };
  try {
    body = (await request.json()) as { clientId?: string; missingDocName?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const missingDocName =
    typeof body.missingDocName === "string" ? body.missingDocName.trim() : "";

  if (!clientId || !missingDocName) {
    return NextResponse.json(
      { error: "Missing clientId or missingDocName" },
      { status: 400 }
    );
  }

  if (!isWhatsAppConfigured()) {
    return NextResponse.json(
      { error: "WhatsApp bridge is not configured" },
      { status: 500 }
    );
  }

  const supabase = supabaseForVerifiedAdminWhatsApp();
  const { data: client, error: fetchErr } = await supabase
    .from("clients")
    .select("id, full_name, phone, short_id")
    .eq("id", clientId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (!String((client as { phone?: string | null }).phone ?? "").trim()) {
    return NextResponse.json(
      { error: "Invalid or missing phone number for WhatsApp" },
      { status: 400 }
    );
  }

  const shortId = await ensureClientShortId(supabase, client.id as string);
  if (!shortId) {
    return NextResponse.json(
      { error: "Could not assign portal short link for this client" },
      { status: 500 }
    );
  }
  let portalLink: string;
  try {
    portalLink = whatsappPortalLinkFromShortIdWithMode(shortId, "documents");
  } catch {
    return NextResponse.json(
      { error: "Invalid portal short link" },
      { status: 500 }
    );
  }
  const message = buildDocReminderMessage(
    String(client.full_name ?? "לקוח"),
    missingDocName,
    portalLink
  );

  const ok = await sendWhatsAppTextMessage({
    phone: client.phone as string,
    text: message,
    logLabel: "whatsapp/send-doc-reminder",
    logMeta: { clientId: client.id as string },
  });

  if (!ok) {
    return NextResponse.json(
      { error: "שליחת WhatsApp נכשלה. בדקו את ה-Bridge וה-WHATSAPP_SERVICE_URL." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
