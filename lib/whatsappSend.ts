/**
 * Send WhatsApp text via the external bridge (Baileys). Replaces Green API.
 */

import { israeliPhoneDigitsE164Style } from "@/lib/appUrls";

const LOG = "[whatsappSend]";

export function getWhatsAppBridgeBaseUrl(): string | null {
  const u = process.env.WHATSAPP_SERVICE_URL?.trim().replace(/\/$/, "");
  return u && u.length > 0 ? u : null;
}

function bridgeAuthHeader(): string | null {
  const t = process.env.WHATSAPP_SERVICE_TOKEN?.trim();
  if (!t) return null;
  return `Bearer ${t}`;
}

export function getDefaultConnectionId(): string {
  return process.env.WHATSAPP_DEFAULT_CONNECTION_ID?.trim() || "default";
}

export type SendWhatsAppTextResult = { ok: boolean; error?: string };

/**
 * Send a plain text message. Normalizes IL phone to JID; bridge maps to s.whatsapp.net.
 */
export async function sendWhatsAppTextMessage(params: {
  phone: string | null;
  text: string;
  connectionId?: string;
  logLabel: string;
  logMeta?: Record<string, string>;
}): Promise<boolean> {
  const base = getWhatsAppBridgeBaseUrl();
  if (!base) {
    console.error(LOG, "missing WHATSAPP_SERVICE_URL", { label: params.logLabel });
    return false;
  }
  const token = bridgeAuthHeader();
  if (!token) {
    console.error(LOG, "missing WHATSAPP_SERVICE_TOKEN", { label: params.logLabel });
    return false;
  }
  const digits = israeliPhoneDigitsE164Style(params.phone);
  if (!digits) {
    console.warn(LOG, "invalid phone", { label: params.logLabel, ...params.logMeta });
    return false;
  }
  const conn = params.connectionId?.trim() || getDefaultConnectionId();
  const url = `${base}/v1/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: JSON.stringify({
        connectionId: conn,
        to: digits,
        text: params.text,
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(LOG, "send failed", {
        label: params.logLabel,
        status: res.status,
        body: body.slice(0, 500),
        ...params.logMeta,
      });
      return false;
    }
    console.info(LOG, "sent", { label: params.logLabel, ...params.logMeta });
    return true;
  } catch (e) {
    console.error(LOG, "request error", {
      label: params.logLabel,
      error: e instanceof Error ? e.message : String(e),
      ...params.logMeta,
    });
    return false;
  }
}

/**
 * For routes that need to check configuration before work (same as old getGreenSendMessageUrl).
 */
export function isWhatsAppConfigured(): boolean {
  return (
    getWhatsAppBridgeBaseUrl() != null &&
    process.env.WHATSAPP_SERVICE_TOKEN != null &&
    String(process.env.WHATSAPP_SERVICE_TOKEN).trim() !== ""
  );
}
