import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { supabaseForVerifiedAdminWhatsApp } from "@/lib/supabaseWhatsAppAdmin";
import { isWhatsAppConfigured, sendWhatsAppTextMessage } from "@/lib/whatsappSend";

export const dynamic = "force-dynamic";

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

  const b =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
  const message =
    typeof b.message === "string" ? b.message.trim() : "";

  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  if (!isWhatsAppConfigured()) {
    return NextResponse.json(
      { error: "WhatsApp bridge not configured (WHATSAPP_SERVICE_URL and WHATSAPP_SERVICE_TOKEN)" },
      { status: 500 }
    );
  }

  const supabase = supabaseForVerifiedAdminWhatsApp();
  const { data: client, error: fetchErr } = await supabase
    .from("clients")
    .select("id, phone")
    .eq("id", clientId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[whatsapp/send-free-message] Supabase error", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (!String(client.phone ?? "").trim()) {
    return NextResponse.json(
      { error: "Invalid or missing phone number for WhatsApp" },
      { status: 400 }
    );
  }

  const ok = await sendWhatsAppTextMessage({
    phone: client.phone as string,
    text: message,
    logLabel: "whatsapp/send-free-message",
    logMeta: { clientId },
  });

  if (!ok) {
    return NextResponse.json(
      {
        error:
          "שליחת ההודעה ב-WhatsApp נכשלה. בדקו ששירות ה-Bridge (Baileys) פועל, ש-WHATSAPP_SERVICE_URL/TOKEN בשרת, ולוגי השירות.",
      },
      { status: 502 }
    );
  }

  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("clients")
    .update({
      last_reminder_at: nowIso,
      reminder_mode: "auto",
      next_custom_reminder: null,
    })
    .eq("id", clientId);

  if (upErr) {
    console.error(
      "[whatsapp/send-free-message] Message sent but client update failed",
      upErr.message
    );
    return NextResponse.json(
      {
        error: `ההודעה נשלחה אך עדכון התיק נכשל: ${upErr.message}`,
        sent: true,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
