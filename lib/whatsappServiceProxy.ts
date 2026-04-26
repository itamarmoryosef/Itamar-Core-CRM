/**
 * Forward admin WhatsApp UI + internal sends to the standalone Baileys service.
 */

import { getWhatsAppBridgeBaseUrl } from "@/lib/whatsappSend";

const LOG = "[whatsappServiceProxy]";

function authHeader(): { Authorization: string } | { Authorization?: undefined } {
  const t = process.env.WHATSAPP_SERVICE_TOKEN?.trim();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

export function bridgeConfigured(): boolean {
  const t = process.env.WHATSAPP_SERVICE_TOKEN?.trim();
  return getWhatsAppBridgeBaseUrl() != null && Boolean(t);
}

function base(): string {
  return getWhatsAppBridgeBaseUrl() || "";
}

/** Resolve connection id: header X-Tenant-Id, query param tenant, or "default" */
export function connectionIdFromRequest(request: Request): string {
  const h = request.headers.get("x-tenant-id")?.trim();
  if (h) return h;
  try {
    const u = new URL(request.url);
    const t = u.searchParams.get("tenant")?.trim();
    if (t) return t;
  } catch {
    /* */
  }
  return "default";
}

export async function proxyJson(
  method: "GET" | "POST" | "DELETE",
  path: string,
  init?: { body?: unknown; search?: string }
): Promise<Response> {
  if (!bridgeConfigured()) {
    return Response.json(
      { error: "whatservice_not_configured", message: "Set WHATSAPP_SERVICE_URL and WHATSAPP_SERVICE_TOKEN" },
      { status: 503 }
    );
  }
  const b = init?.search
    ? `${path}${init.search.startsWith("?") ? init.search : `?${init.search}`}`
    : path;
  const url = `${base()}${b}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeader(),
      } as Record<string, string>,
      body:
        method !== "GET" && init?.body != null
          ? JSON.stringify(init.body)
          : undefined,
    });
    const text = await res.text();
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return new Response(text, { status: res.status, headers: { "content-type": "application/json" } });
    }
    return new Response(text, { status: res.status });
  } catch (e) {
    console.error(LOG, path, e);
    return Response.json(
      { error: "bridge_unavailable", message: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
