import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * אותו לוגיקה כמו GET /api/admin/features — קודי פיצ׳ר מופעלים לארגון.
 * `null` = מערכת system_features/organization_feature_map לא מותקנת.
 */
export async function getOrgEnabledFeatureCodes(
  admin: SupabaseClient,
  organizationId: string
): Promise<string[] | null> {
  const { data: catalog, error: ce } = await admin
    .from("system_features")
    .select("id, code, sort_order")
    .order("sort_order", { ascending: true });
  if (ce) {
    const m = ce.message?.toLowerCase() ?? "";
    if (/relation|does not exist|schema/.test(m)) {
      return null;
    }
    throw new Error(ce.message);
  }

  const { data: flagRows, error: fe } = await admin
    .from("organization_feature_map")
    .select("system_feature_id, enabled")
    .eq("organization_id", organizationId);
  if (fe) {
    const m = fe.message?.toLowerCase() ?? "";
    if (/relation|does not exist|schema/.test(m)) {
      return null;
    }
    throw new Error(fe.message);
  }

  const flagMap = new Map(
    (flagRows ?? []).map(
      (r) =>
        [r.system_feature_id as string, (r as { enabled: boolean }).enabled] as const
    )
  );
  const enabledCodes: string[] = [];
  for (const c of catalog ?? []) {
    const id = c.id as string;
    const code = c.code as string;
    if (flagMap.get(id) === false) {
      continue;
    }
    enabledCodes.push(code);
  }
  return enabledCodes;
}

export function orgHasAnyFeature(
  enabledCodes: string[] | null,
  codes: readonly string[]
): boolean {
  if (enabledCodes === null) {
    return true;
  }
  return codes.some((c) => enabledCodes.includes(c));
}
