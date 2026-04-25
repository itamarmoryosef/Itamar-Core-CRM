import type { SupabaseClient } from "@supabase/supabase-js";

/** Sections table: base schema uses `custom_field_sections`; optional CRM paste uses `crm_layout_sections`. */
export type LayoutSectionsTableName =
  | "crm_layout_sections"
  | "custom_field_sections";

let cached: LayoutSectionsTableName | null = null;

function isMissingRelationError(err: {
  code?: string;
  message?: string;
}): boolean {
  const m = err.message ?? "";
  return (
    err.code === "PGRST205" ||
    /could not find.*\b(table|relationship)\b/i.test(m) ||
    /relation\s+[\w.]+\s+does not exist/i.test(m)
  );
}

/**
 * Detect which sections table exists. Prefer `crm_layout_sections` when present
 * (paste migration + FKs there); otherwise `custom_field_sections` from database.sql.
 */
export async function getLayoutSectionsTableName(
  supabase: SupabaseClient
): Promise<LayoutSectionsTableName> {
  if (cached) return cached;

  const crm = await supabase.from("crm_layout_sections").select("id").limit(1);
  if (!crm.error) {
    cached = "crm_layout_sections";
    return cached;
  }
  if (isMissingRelationError(crm.error)) {
    const custom = await supabase
      .from("custom_field_sections")
      .select("id")
      .limit(1);
    if (!custom.error) {
      cached = "custom_field_sections";
      return cached;
    }
  }

  cached = "custom_field_sections";
  return cached;
}
