import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeCrmLayoutSlots,
  type CrmLayoutSlotRow,
} from "@/lib/crmClientCardLayout";

/** PostgREST / Postgres wording when select lists an unknown column. */
function looksLikeUnknownColumnError(message: string): boolean {
  return (
    /does not exist/i.test(message) ||
    /column\s+[\w.]+\s+does not exist/i.test(message)
  );
}

/**
 * Which columns existed on the successful `select`.
 * - `legacy_no_span`: DB has no `column_span` — avoid INSERT/UPDATE that reference it until migration.
 * - `no_divider`: no `divider_config` column — divider saves may fail until `add_crm_layout_dividers.sql`.
 */
export type CrmLayoutSlotsSchemaLevel =
  | "full"
  | "no_divider"
  | "legacy_no_span";

/**
 * Load `crm_layout_slots` with progressively smaller select lists so older DBs
 * (without `column_span` / `divider_config`) still work for read-only views.
 * Always fills missing `column_span` with 4 in memory.
 */
export async function fetchCrmLayoutSlotsResilient(
  supabase: SupabaseClient
): Promise<{
  rows: CrmLayoutSlotRow[];
  error: string | null;
  schemaLevel: CrmLayoutSlotsSchemaLevel;
}> {
  const selections: {
    list: string;
    level: CrmLayoutSlotsSchemaLevel;
  }[] = [
    {
      list: "id, section_id, row_number, column_span, sort_order, slot_kind, core_key, definition_id, divider_config",
      level: "full",
    },
    {
      list: "id, section_id, row_number, column_span, sort_order, slot_kind, core_key, definition_id",
      level: "no_divider",
    },
    {
      list: "id, section_id, row_number, sort_order, slot_kind, core_key, definition_id",
      level: "legacy_no_span",
    },
  ];

  let lastMessage: string | null = null;

  for (const { list: selectList, level: schemaLevel } of selections) {
    const res = await supabase
      .from("crm_layout_slots")
      .select(selectList)
      .order("row_number", { ascending: true })
      .order("sort_order", { ascending: true });

    // Supabase returns `data: []` for zero rows — must not treat as failure.
    // Rare: `data: null` with no error — treat as empty.
    if (!res.error) {
      const raw = res.data;
      const arr = Array.isArray(raw) ? raw : [];
      const withDefaults = (arr as Partial<CrmLayoutSlotRow>[]).map(
        (r) =>
          ({
            ...r,
            column_span:
              typeof r.column_span === "number" &&
              Number.isFinite(r.column_span)
                ? r.column_span
                : 4,
            divider_config:
              r.divider_config !== undefined ? r.divider_config : null,
          }) as CrmLayoutSlotRow
      );
      return {
        rows: normalizeCrmLayoutSlots(withDefaults),
        error: null,
        schemaLevel,
      };
    }

    const msg = res.error.message ?? "";
    const code = res.error.code ?? "";
    const det =
      res.error.details != null ? String(res.error.details) : "";
    lastMessage =
      [msg, code && `code=${code}`, det && `details=${det}`]
        .filter(Boolean)
        .join(" — ") || null;
    if (!msg || !looksLikeUnknownColumnError(msg)) {
      break;
    }
  }

  return {
    rows: [],
    error: lastMessage,
    schemaLevel: "legacy_no_span",
  };
}
