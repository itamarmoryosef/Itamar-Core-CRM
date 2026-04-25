/**
 * CRM pipeline labels are stored in `clients.status` (mirrored from `status_id` via DB trigger).
 * Canonical list in DB: `client_statuses`. These constants remain for portal/cron string updates.
 */
export const CLIENT_CRM_STATUS_DEFAULT = "ממתין למסמכים" as const;

export const CLIENT_CRM_STATUSES = [
  CLIENT_CRM_STATUS_DEFAULT,
  "מסמכים הושלמו",
  "הוגש - ממתין לתשובה",
  "הסתיים - טופל בהצלחה",
  "הסתיים - ללא מכירה",
] as const;

export const CLIENT_CRM_STATUSES_FALLBACK: string[] = [...CLIENT_CRM_STATUSES];

export type ClientCrmStatus = (typeof CLIENT_CRM_STATUSES)[number];

const STATUS_SET = new Set<string>(CLIENT_CRM_STATUSES);

/** Clients waiting on portal signatures — included in automated doc-reminder cadence. */
export const CLIENT_CRM_STATUS_AWAITING_SIGNATURE = "ממתין לחתימה" as const;

export type NormalizeClientCrmStatusOptions = {
  /** When set (from `client_statuses`), unknown labels map to `fallbackLabel`. */
  validLabels?: ReadonlySet<string>;
  fallbackLabel?: string;
};

export function normalizeClientCrmStatus(
  value: string | null | undefined,
  options?: NormalizeClientCrmStatusOptions
): string {
  const trimmed = value?.trim() ?? "";
  const fallback = options?.fallbackLabel ?? CLIENT_CRM_STATUS_DEFAULT;

  if (!trimmed) {
    return fallback;
  }

  if (trimmed === CLIENT_CRM_STATUS_AWAITING_SIGNATURE) {
    if (options?.validLabels?.has(trimmed)) {
      return trimmed;
    }
    return CLIENT_CRM_STATUS_DEFAULT;
  }

  if (options?.validLabels) {
    return options.validLabels.has(trimmed) ? trimmed : fallback;
  }

  if (STATUS_SET.has(trimmed)) {
    return trimmed as ClientCrmStatus;
  }

  return fallback;
}

/**
 * CRM value used by portal `documents-complete` (advance to מסמכים הושלמו).
 * Not the same as automated reminder eligibility (see below).
 */
export const CLIENT_CRM_STATUS_REMINDER_ELIGIBLE = CLIENT_CRM_STATUS_DEFAULT;

/**
 * **Automatic** document reminder bot only (`/api/cron/reminders` 3-day batch).
 * Uses the same effective “early pipeline” rule as {@link normalizeClientCrmStatus}:
 * eligible when we are still before/around document collection (default bucket), including
 * `null`/unknown values and `ממתין לחתימה` (not in `CLIENT_CRM_STATUSES` but normalized to default).
 * Not eligible after submit or when CRM is past “waiting for documents”.
 */
export function isCrmStatusEligibleForAutomatedDocumentReminder(
  status: string | null | undefined
): boolean {
  if (isPastPortalApplicationSubmit(status)) return false;
  const normalized = normalizeClientCrmStatus(status);
  return normalized === CLIENT_CRM_STATUS_DEFAULT;
}

/**
 * Master switch on `clients.reminders_enabled` (default true).
 * When explicitly `false`, cron must not send automated reminder traffic for the client.
 */
export function clientAllowsAutomatedReminders(row: {
  reminders_enabled?: boolean | null;
}): boolean {
  return row.reminders_enabled !== false;
}

/** סטטוס אחרי שהלקוח השלים את כל המסמכים הנדרשים בפורטל. */
export const CLIENT_CRM_STATUS_DOCUMENTS_COMPLETE = "מסמכים הושלמו" as const;

/** סטטוס אחרי שליחת הבקשה בפורטל (שלב סופי). */
export const CLIENT_CRM_STATUS_PORTAL_SUBMITTED = "הוגש - ממתין לתשובה" as const;

const REQUIRED_SYSTEM_STATUSES = [
  CLIENT_CRM_STATUS_DEFAULT,
  CLIENT_CRM_STATUS_DOCUMENTS_COMPLETE,
  CLIENT_CRM_STATUS_PORTAL_SUBMITTED,
] as const;

export function parseCustomClientCrmStatuses(
  value: string | null | undefined
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  for (const part of (value ?? "").split("\n")) {
    push(part);
  }
  for (const status of REQUIRED_SYSTEM_STATUSES) {
    push(status);
  }

  return out.length > 0 ? out : [...CLIENT_CRM_STATUSES_FALLBACK];
}

export function serializeClientCrmStatuses(statuses: string[]): string {
  return statuses.map((s) => s.trim()).filter(Boolean).join("\n");
}

export const CLIENT_CRM_BOT_ENABLED_STATUSES_FALLBACK: string[] = [
  CLIENT_CRM_STATUS_REMINDER_ELIGIBLE,
];

export function parseBotEnabledClientCrmStatuses(
  value: string | null | undefined,
  availableStatuses?: string[]
): string[] {
  const allowed = new Set(
    (availableStatuses && availableStatuses.length > 0
      ? availableStatuses
      : CLIENT_CRM_STATUSES_FALLBACK
    ).map((s) => s.trim())
  );

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (value ?? "").split("\n")) {
    const s = raw.trim();
    if (!s || seen.has(s)) continue;
    if (!allowed.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  if (out.length > 0) return out;

  const fallback = CLIENT_CRM_BOT_ENABLED_STATUSES_FALLBACK.filter((s) =>
    allowed.has(s)
  );
  return fallback.length > 0 ? fallback : [CLIENT_CRM_STATUS_DEFAULT];
}

const POST_PORTAL_SUBMIT_PIPELINE = new Set<string>([
  CLIENT_CRM_STATUS_PORTAL_SUBMITTED,
  "הסתיים - טופל בהצלחה",
  "הסתיים - ללא מכירה",
  "הסתיים - לא קיבל רישיון", // legacy
]);

/** לקוח שכבר שלח בקשה (או שהתיק סגור) — להציג מסך סיום בפורטל במקום טופס. */
export function isPastPortalApplicationSubmit(
  status: string | null | undefined
): boolean {
  const s = status?.trim() ?? "";
  return POST_PORTAL_SUBMIT_PIPELINE.has(s);
}
