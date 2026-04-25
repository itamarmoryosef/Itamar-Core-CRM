/**
 * WhatsApp message when CRM moves a client to "license granted / paid" success status.
 * Labels are configurable — match `client_statuses.label` (normalized).
 *
 * WhatsApp uses the direct review URL from {@link getLicenseGrantedReviewRedirectTarget} (default: Google share).
 * `/r/google-review` still redirects there.
 */

/**
 * Default redirect if `LICENSE_GRANTED_REVIEW_URL` is unset: direct Google share/review link.
 * Override with `LICENSE_GRANTED_REVIEW_URL` if this changes.
 */
export const DEFAULT_LICENSE_GRANTED_REVIEW_URL =
  "https://share.google/5Y2DDyOZ2Waw2XB1R";

function normalizeCrmLabel(s: string): string {
  return s
    .trim()
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/[\u2013\u2014\u2212]/g, "-");
}

/** Env: pipe-separated labels, e.g. `קיבל רישיון - שולם בהצלחה|קיבל רישיון- שולם בהצלחה` */
function allowedLicenseGrantedLabels(): string[] {
  const raw = process.env.LICENSE_GRANTED_REVIEW_STATUS_LABELS?.trim();
  if (raw) {
    return raw
      .split("|")
      .map((x) => normalizeCrmLabel(x))
      .filter(Boolean);
  }
  return [
    normalizeCrmLabel("הסתיים - טופל בהצלחה"),
    normalizeCrmLabel("הושלם - שולם"),
    normalizeCrmLabel("נסגרה עסקה - שביעות רצון"),
  ];
}

/**
 * True if this CRM label should trigger the review WhatsApp.
 * 1) Exact match (after normalize) to env list or built-in defaults.
 * 2) Loose: "הסתיים" + "טופל בהצלחה" (success pipeline, excludes "ללא" / "לא" outcomes).
 */
export function licenseGrantedReviewStatusMatches(
  statusLabel: string | null | undefined
): boolean {
  if (!statusLabel?.trim()) return false;
  const n = normalizeCrmLabel(statusLabel);
  const allowed = allowedLicenseGrantedLabels();
  if (allowed.some((a) => a === n)) return true;

  if (n.includes("הסתיים") && n.includes("טופל בהצלחה")) {
    if (n.includes("לא") || n.includes("ללא")) return false;
    return true;
  }

  return false;
}

/** Destination for GET `/r/google-review` (Google reviews or your own short URL). */
export function getLicenseGrantedReviewRedirectTarget(): string {
  const fromEnv = process.env.LICENSE_GRANTED_REVIEW_URL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_LICENSE_GRANTED_REVIEW_URL;
}

/**
 * URL embedded in WhatsApp — the same destination clients open (direct Google link by default).
 */
export function getLicenseGrantedReviewPageUrl(): string {
  return getLicenseGrantedReviewRedirectTarget();
}

export function buildLicenseGrantedReviewMessage(
  fullName: string,
  reviewUrl: string
): string {
  const name = fullName.trim() || "לקוח";
  return [
    `היי ${name},`,
    "",
    "תודה שבחרתם בנו — שמחים לסייע. נשמח לביקורת (5 כוכבים) בקישור:",
    "",
    reviewUrl.trim(),
  ].join("\n");
}
