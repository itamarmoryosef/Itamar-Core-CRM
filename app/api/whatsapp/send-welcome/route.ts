import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { ensureClientShortId } from "@/lib/ensureClientShortId";
import { supabaseForVerifiedAdminWhatsApp } from "@/lib/supabaseWhatsAppAdmin";
import { whatsappPortalLinkFromShortId } from "@/lib/appUrls";
import { businessName } from "@/lib/branding";
import { isWhatsAppConfigured, sendWhatsAppTextMessage } from "@/lib/whatsappSend";

export const dynamic = "force-dynamic";

function buildWelcomeMessage(fullName: string, portalLink: string): string {
  const org = businessName();
  return `שלום ${fullName},\nברוך הבא ל־${org}. לטיפול בתיק והעלאת מסמכים, היכנסו לקישור:\n${portalLink}`;
}

export async function POST(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientId =
    typeof body === "object" &&
    body !== null &&
    "clientId" in body &&
    typeof (body as { clientId: unknown }).clientId === "string"
      ? (body as { clientId: string }).clientId
      : null;

  if (!clientId?.trim()) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
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
    .eq("id", clientId.trim())
    .maybeSingle();

  if (fetchErr) {
    console.error("[whatsapp/send-welcome] Supabase error", fetchErr.message);
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
    portalLink = whatsappPortalLinkFromShortId(shortId);
  } catch {
    return NextResponse.json(
      { error: "Invalid portal short link" },
      { status: 500 }
    );
  }
  const message = buildWelcomeMessage(client.full_name as string, portalLink);

  const ok = await sendWhatsAppTextMessage({
    phone: client.phone as string,
    text: message,
    logLabel: "whatsapp/send-welcome",
    logMeta: { clientId: client.id as string },
  });

  if (!ok) {
    return NextResponse.json(
      {
        error: "שליחת WhatsApp נכשלה. בדקו את שירות ה-Bridge והמשתנים WHATSAPP_SERVICE_URL / TOKEN.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
