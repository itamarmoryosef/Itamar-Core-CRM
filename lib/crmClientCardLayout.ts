/**
 * Global CRM client-card canvas: core columns + custom definitions,
 * ordered by `crm_layout_slots`. `section_id` references `custom_field_sections`
 * (database.sql) or `crm_layout_sections` after optional CRM layout paste — see `getLayoutSectionsTableName`.
 */

export type CrmLayoutSlotKind = "core" | "custom" | "divider";

/** Raw `slot_kind` from DB may use legacy names; normalized in `normalizeCrmLayoutSlotRow`. */
export type CrmLayoutSlotKindRaw = string | null | undefined;

export type CrmDividerStyle = "solid" | "dashed" | "minimal";

export type CrmDividerConfig = {
  title: string;
  thickness_px: 1 | 2 | 4;
  color_hex: string;
  style: CrmDividerStyle;
};

export type CrmLayoutSlotRow = {
  id: string;
  section_id: string;
  row_number: number;
  column_span: number;
  sort_order: number;
  slot_kind: CrmLayoutSlotKind;
  core_key: string | null;
  definition_id: string | null;
  divider_config?: CrmDividerConfig | null;
};

const DIVIDER_HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function defaultDividerConfig(): CrmDividerConfig {
  return {
    title: "",
    thickness_px: 2,
    color_hex: "#94a3b8",
    style: "solid",
  };
}

/** Normalizes JSON from DB or partial objects. */
export function normalizeDividerConfig(
  raw: CrmDividerConfig | null | undefined | Record<string, unknown>
): CrmDividerConfig {
  const d = defaultDividerConfig();
  try {
    if (!raw || typeof raw !== "object") return d;
    const o = raw as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title : d.title;
    const tp = Number(o.thickness_px);
    const thickness_px: 1 | 2 | 4 =
      tp === 1 || tp === 2 || tp === 4 ? (tp as 1 | 2 | 4) : d.thickness_px;
    const ch =
      typeof o.color_hex === "string" && DIVIDER_HEX_RE.test(o.color_hex.trim())
        ? o.color_hex.trim()
        : d.color_hex;
    const st = o.style;
    const style: CrmDividerStyle =
      st === "dashed" || st === "minimal" || st === "solid" ? st : d.style;
    return { title, thickness_px, color_hex: ch, style };
  } catch {
    return d;
  }
}

export const CRM_CORE_FIELD_KEYS = [
  "full_name",
  "id_number",
  "phone",
  "agreement_notes",
  "fee_upfront",
  "fee_success",
  "total_amount",
  "payment_status",
  "crm_status",
  "lead_source",
  "lead_provider_name",
  "closed_by",
] as const;

export type CrmCoreFieldKey = (typeof CRM_CORE_FIELD_KEYS)[number];

/**
 * Fixed "פרטי לקוח — כל השדות" grid: excludes `full_name` so "שם מלא" is only
 * edited via the custom-field slot (see {@link customFieldSlugMapsToCoreFullName}).
 */
export const CRM_CORE_FIELD_KEYS_FOR_OVERVIEW = CRM_CORE_FIELD_KEYS.filter(
  (k): k is CrmCoreFieldKey => k !== "full_name"
);

/** True when this custom field slug is the canonical client display name (שם מלא). */
export function customFieldSlugMapsToCoreFullName(slug: string): boolean {
  return normalizeCoreSlotKey(slug) === "full_name";
}

export const CRM_CORE_FIELD_LABELS: Record<CrmCoreFieldKey, string> = {
  full_name: "שם מלא",
  id_number: "מספר תעודת זהות",
  phone: "טלפון",
  agreement_notes: "הערות להסכם",
  fee_upfront: "מקדמה (טקסט)",
  fee_success: "הצלחה (טקסט)",
  total_amount: "סכום כולל",
  payment_status: "סטטוס תשלום",
  crm_status: "סטטוס CRM",
  lead_source: "מקור ליד",
  lead_provider_name: "ספק ליד",
  closed_by: "סוגר עסקה",
};

export function isCrmCoreFieldKey(k: string): k is CrmCoreFieldKey {
  return (CRM_CORE_FIELD_KEYS as readonly string[]).includes(k);
}

const CORE_SLOT_KEY_ALIASES: Record<string, CrmCoreFieldKey> = {
  fullname: "full_name",
  name: "full_name",
  client_name: "full_name",
  id: "id_number",
  national_id: "id_number",
  teudat_zehut: "id_number",
  tz: "id_number",
  idnum: "id_number",
  mobile: "phone",
  tel: "phone",
  telephone: "phone",
};

/** Maps designer/DB aliases to canonical `core_key` values used in the client card. */
export function normalizeCoreSlotKey(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const lower = t.toLowerCase().replace(/\s+/g, "_");
  if (isCrmCoreFieldKey(lower)) return lower;
  const aliased = CORE_SLOT_KEY_ALIASES[lower];
  if (aliased) return aliased;
  return lower;
}

export function normalizeCrmLayoutSlotKind(
  raw: CrmLayoutSlotKindRaw,
  opts: {
    core_key?: string | null;
    definition_id?: string | null;
    divider_config?: unknown;
  }
): CrmLayoutSlotKind {
  const k = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (k === "divider") return "divider";
  if (
    opts.divider_config != null &&
    typeof opts.divider_config === "object" &&
    !Array.isArray(opts.divider_config)
  ) {
    return "divider";
  }
  if (k === "custom") return "custom";
  if (k === "core" || k === "core_field" || k === "corefield") return "core";
  if (opts.core_key?.trim()) return "core";
  if (opts.definition_id?.trim()) return "custom";
  return "custom";
}

export function normalizeCrmLayoutSlotRow(
  s: CrmLayoutSlotRow & { slot_kind?: CrmLayoutSlotKindRaw }
): CrmLayoutSlotRow {
  const slot_kind = normalizeCrmLayoutSlotKind(s.slot_kind, {
    core_key: s.core_key,
    definition_id: s.definition_id,
    divider_config: s.divider_config,
  });
  if (slot_kind === "divider") {
    return { ...s, slot_kind, core_key: null, definition_id: null };
  }
  if (slot_kind === "custom") {
    return { ...s, slot_kind, core_key: null };
  }
  const nk = normalizeCoreSlotKey(s.core_key);
  return { ...s, slot_kind: "core", core_key: nk };
}

export function normalizeCrmLayoutSlots(
  slots: (CrmLayoutSlotRow & { slot_kind?: CrmLayoutSlotKindRaw })[]
): CrmLayoutSlotRow[] {
  return slots.map(normalizeCrmLayoutSlotRow);
}

/** Word-style double-brace (core keys match populateAgreementDocx where applicable). */
export function coreFieldWordPlaceholder(key: CrmCoreFieldKey): string {
  return `{{${key}}}`;
}

export function labelForCoreKey(key: string): string {
  if (isCrmCoreFieldKey(key)) return CRM_CORE_FIELD_LABELS[key];
  return key;
}

export function groupSlotsBySectionAndRow(
  slots: CrmLayoutSlotRow[]
): Map<string, Map<number, CrmLayoutSlotRow[]>> {
  const bySection = new Map<string, Map<number, CrmLayoutSlotRow[]>>();
  for (const s of slots) {
    if (!bySection.has(s.section_id)) {
      bySection.set(s.section_id, new Map());
    }
    const m = bySection.get(s.section_id)!;
    const rn = s.row_number;
    if (!m.has(rn)) m.set(rn, []);
    m.get(rn)!.push(s);
  }
  for (const m of bySection.values()) {
    for (const arr of m.values()) {
      arr.sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          String(a.id ?? "").localeCompare(String(b.id ?? ""))
      );
    }
  }
  return bySection;
}

/** When DB has no slots yet, derive layout from definitions (legacy). */
export function legacySlotsFromDefinitions(
  defs: readonly {
    id: string;
    section_id?: string | null;
    row_number?: number;
    column_span?: number;
    sort_order?: number;
  }[]
): CrmLayoutSlotRow[] {
  const out: CrmLayoutSlotRow[] = [];
  for (const d of defs) {
    const sid = d.section_id?.trim() ? d.section_id : null;
    if (!sid) continue;
    out.push({
      id: `legacy-${d.id}`,
      section_id: sid,
      row_number: d.row_number ?? 1,
      column_span: d.column_span ?? 4,
      sort_order: d.sort_order ?? 0,
      slot_kind: "custom",
      core_key: null,
      definition_id: d.id,
    });
  }
  return out;
}
