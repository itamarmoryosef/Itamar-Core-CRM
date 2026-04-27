import { businessName } from "@/lib/branding";
import { whatsappPortalLinkFromShortId, whatsappPortalLinkFromShortIdWithMode } from "@/lib/appUrls";
import { isValidShortIdParam } from "@/lib/clientShortId";

export type ClientMessageMergeContext = {
  fullName: string;
  phone?: string | null;
  shortId?: string | null;
  brandName?: string | null;
  /** "documents" | "sign" — which portal link in [לינק_פורטל] (default: documents) */
  portalMode?: "documents" | "sign";
};

function firstNameFromFullName(full: string): string {
  const t = full.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.split(/\s+/u)[0] ?? t;
}

function buildPortalUrl(shortId: string, mode: "documents" | "sign"): string | null {
  const s = shortId.trim().toLowerCase();
  if (!isValidShortIdParam(s)) return null;
  return mode === "sign"
    ? whatsappPortalLinkFromShortIdWithMode(s, "sign")
    : whatsappPortalLinkFromShortIdWithMode(s, "documents");
}

/**
 * Replaces bracket placeholders in a saved template. Works client- or server-side
 * (pass brandName in server if not in browser public env).
 */
export function mergeClientOutboundMessage(
  text: string,
  ctx: ClientMessageMergeContext
): string {
  const full = (ctx.fullName || "").replace(/\s+/g, " ").trim();
  const first = firstNameFromFullName(full) || full;
  const phone = (ctx.phone ?? "").replace(/\s+/g, "").trim();
  const brand = (ctx.brandName?.trim() || businessName() || "המערכת").trim();
  const mode = ctx.portalMode ?? "documents";
  const link =
    ctx.shortId
      ? buildPortalUrl(ctx.shortId, mode)
      : null;

  let out = text;
  const pairs: [RegExp, string][] = [
    [/\[שם_מלא\]/g, full],
    [/\[שם\]/g, full],
    [/\[שם_פרטי\]/g, first],
    [/\[טלפון\]/g, phone || ""],
    [/\[לינק_פורטל\]/g, link || ""],
    [/\[שם_מותג\]/g, brand],
  ];
  for (const [re, v] of pairs) {
    out = out.replace(re, v);
  }
  return out;
}

/** Known placeholders for admin UI (insert menu). */
export const OUTBOUND_MESSAGE_PLACEHOLDER_MENU: { value: string; label: string }[] = [
  { value: "[שם_פרטי]", label: "שם פרטי" },
  { value: "[שם_מלא]", label: "שם מלא" },
  { value: "[שם_מותג]", label: "שם מותג" },
  { value: "[טלפון]", label: "טלפון" },
  { value: "[לינק_פורטל]", label: "לינק פורטל" },
];
