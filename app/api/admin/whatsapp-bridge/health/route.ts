import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { getWhatsAppBridgeBaseUrl } from "@/lib/whatsappSend";

export const dynamic = "force-dynamic";

/**
 * Returns bridge env state + a lightweight reachability check (for admin settings UI).
 */
export async function GET() {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = getWhatsAppBridgeBaseUrl();
  const token = process.env.WHATSAPP_SERVICE_TOKEN?.trim();
  const configured = Boolean(url && url.length > 0 && token);
  if (!configured) {
    return NextResponse.json({
      configured: false,
      reachable: false,
      error: "whatservice_not_configured",
      message: "Set WHATSAPP_SERVICE_URL and WHATSAPP_SERVICE_TOKEN in the Next.js server environment",
    });
  }
  const base = url!.replace(/\/$/, "");
  const paths = ["/health", "/v1/health", "/api/health", ""];
  let lastMsg = "";
  for (const p of paths) {
    const probe = p === "" ? base : `${base}${p.startsWith("/") ? "" : "/"}${p}`.replace(/([^:])\/\//, "$1/");
    try {
      const res = await fetch(probe, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text();
      return NextResponse.json({
        configured: true,
        reachable: res.ok || res.status < 500,
        status: res.status,
        path: p || "/",
        bodyPreview: text.slice(0, 200),
      });
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json({
    configured: true,
    reachable: false,
    error: "bridge_unavailable",
    message: lastMsg,
  });
}
