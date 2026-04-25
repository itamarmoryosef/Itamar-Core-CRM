/**
 * Portal, admin, and app URL helpers (replaces former greenWhatsApp non-Green logic).
 */
import { isValidShortIdParam } from "@/lib/clientShortId";
import { businessName } from "@/lib/branding";

export const PUBLIC_PRODUCTION_ORIGIN = (
  process.env.NEXT_PUBLIC_DEFAULT_SITE_ORIGIN?.trim() || "https://example.com"
).replace(/\/$/, "");

const DEFAULT_PORTAL_PUBLIC_BASE = PUBLIC_PRODUCTION_ORIGIN;

export const WHATSAPP_PORTAL_PUBLIC_BASE = PUBLIC_PRODUCTION_ORIGIN;

export function portalPublicBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_PORTAL_BASE_URL?.trim() ||
    DEFAULT_PORTAL_PUBLIC_BASE;
  return raw.replace(/\/$/, "");
}

export function whatsappPortalLinkOrigin(): string {
  const base = portalPublicBaseUrl().trim().replace(/\/$/, "");
  let url = base;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url.replace(/^\/+/, "")}`;
  }
  const hostMatch = url.match(/^https?:\/\/([^/?#]+)/i);
  const host = (hostMatch?.[1] ?? "").split(":")[0].toLowerCase();
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host);
  if (!isLocal && /^http:\/\//i.test(url)) {
    url = `https://${url.slice("http://".length)}`;
  }
  return url.replace(/\/$/, "");
}

export function whatsappPortalLinkFromShortId(shortId: string): string {
  const sid = shortId.trim().toLowerCase();
  if (!isValidShortIdParam(sid)) {
    throw new Error("whatsappPortalLinkFromShortId: invalid short_id");
  }
  const origin = whatsappPortalLinkOrigin();
  return `${origin}/portal/${sid}`;
}

export type WhatsAppPortalMode = "sign" | "documents";

export function appendPortalQueryParam(
  url: string,
  key: string,
  value: string
): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export function whatsappPortalLinkFromShortIdWithMode(
  shortId: string,
  mode: WhatsAppPortalMode
): string {
  const base = whatsappPortalLinkFromShortId(shortId);
  return appendPortalQueryParam(base, "mode", mode);
}

export function siteBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") {
    return PUBLIC_PRODUCTION_ORIGIN.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

const ADMIN_CLIENT_PATH_PREFIX = "/admin/clients";

function stripSlash(s: string) {
  return s.trim().replace(/\/+$/, "");
}

export function adminAppOrigin(): string {
  const vercelHost = process.env.VERCEL_URL?.trim()
    ? process.env.VERCEL_URL.replace(/^https?:\/\//i, "").replace(/\/+$/, "")
    : "";

  const explicit = [
    process.env.ADMIN_APP_ORIGIN?.trim() &&
      stripSlash(process.env.ADMIN_APP_ORIGIN),
    process.env.NEXT_PUBLIC_APP_URL?.trim() &&
      stripSlash(process.env.NEXT_PUBLIC_APP_URL),
    process.env.NEXT_PUBLIC_SITE_URL?.trim() &&
      stripSlash(process.env.NEXT_PUBLIC_SITE_URL),
  ].filter(Boolean) as string[];
  if (explicit.length > 0) return explicit[0];

  if (process.env.NODE_ENV === "production") {
    return stripSlash(PUBLIC_PRODUCTION_ORIGIN);
  }

  if (vercelHost) return `https://${vercelHost}`;
  return stripSlash(siteBaseUrl());
}

export function serverDeployedPublicOrigin(): string {
  const vercelRaw = process.env.VERCEL_URL?.trim();
  const vercelHttps =
    vercelRaw &&
    `https://${vercelRaw.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;

  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    process.env.ADMIN_APP_ORIGIN?.trim(),
    vercelHttps,
    process.env.NEXT_PUBLIC_PORTAL_BASE_URL?.trim(),
  ].filter(Boolean) as string[];

  if (candidates.length > 0) {
    return normalizeOriginForHttpsWhatsApp(candidates[0]!);
  }

  if (process.env.NODE_ENV !== "production") {
    return normalizeOriginForHttpsWhatsApp(siteBaseUrl());
  }

  return whatsappPortalLinkOrigin();
}

function normalizeOriginForHttpsWhatsApp(base: string): string {
  let url = base.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url.replace(/^\/+/, "")}`;
  }
  const hostMatch = url.match(/^https?:\/\/([^/?#]+)/i);
  const host = (hostMatch?.[1] ?? "").split(":")[0].toLowerCase();
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host);
  if (!isLocal && /^http:\/\//i.test(url)) {
    url = `https://${url.slice("http://".length)}`;
  }
  return url.replace(/\/$/, "");
}

export function adminClientDetailUrl(clientUuid: string): string {
  const id = clientUuid.trim();
  if (!id) throw new Error("adminClientDetailUrl: empty client id");
  const origin = adminAppOrigin().replace(/\/+$/, "");
  const path = `${ADMIN_CLIENT_PATH_PREFIX}/${encodeURIComponent(id)}`;
  return new URL(path, `${origin}/`).href;
}

export function buildAdminClientDocumentsFinishedMessage(
  fullName: string,
  clientUuid?: string | null
): string {
  const name = fullName.trim() || "לקוח";
  const body = `הלקוח ${name} סיים להעלות את כל המסמכים. ניתן להיכנס לאדמין לבדיקה.`;
  const u = clientUuid?.trim();
  if (!u) return body;
  try {
    return `${body}\n\n${adminClientDetailUrl(u)}`;
  } catch {
    return body;
  }
}

export function buildAdminAgreementSignedNotificationMessage(
  fullName: string,
  clientUuid: string,
  shortId: string | null,
  agreementSummary: string
): string {
  const name = fullName.trim() || "לקוח";
  const firm = businessName();
  const summary = agreementSummary.trim() || "הסכם";
  const lines = [
    `${firm} — הלקוח ${name} חתם והשלים מסמך דיגיטלי (${summary}).`,
  ];
  const sidRaw = shortId?.trim().toLowerCase() ?? "";
  if (sidRaw && isValidShortIdParam(sidRaw)) {
    lines.push("", `מזהה פורטל: ${sidRaw}`);
    try {
      lines.push(whatsappPortalLinkFromShortId(sidRaw));
    } catch {
      /* */
    }
  } else {
    lines.push("", `מזהה לקוח במערכת: ${clientUuid}`);
  }
  return lines.join("\n");
}

export type PortalClientLinkRef = {
  id: string;
  short_id?: string | null;
};

export function portalPathSegment(client: PortalClientLinkRef): string {
  const sid = client.short_id?.trim().toLowerCase() ?? "";
  if (sid.length === 6 && /^[a-z0-9]{6}$/.test(sid)) return sid;
  return client.id;
}

export function portalLinkForClient(
  clientOrId: PortalClientLinkRef | string
): string {
  const base = portalPublicBaseUrl();
  if (typeof clientOrId === "string") {
    return `${base}/portal/${clientOrId}`;
  }
  return `${base}/portal/${portalPathSegment(clientOrId)}`;
}

/** Digits 972... for JID and wa.me */
export function israeliPhoneDigitsE164Style(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("972")) digits = `972${digits}`;
  if (digits.length < 11) return null;
  return digits;
}

/** @deprecated Use israeliPhoneDigitsE164Style; kept for minimal diff */
export const formatGreenChatId = (raw: string | null): string | null => {
  const d = israeliPhoneDigitsE164Style(raw);
  return d ? `${d}@c.us` : null;
};

/** Used by admin UI (wa.me links) */
export const israeliPhoneDigitsForWaMe = israeliPhoneDigitsE164Style;

export { isValidShortIdParam } from "@/lib/clientShortId";
