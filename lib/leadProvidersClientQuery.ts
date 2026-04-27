import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadProviderListRow = {
  id: string;
  name: string;
  phone?: string | null;
  commission_percent?: number | null;
  created_at?: string | null;
};

const COL_CHAINS = [
  "id, name, phone, commission_percent, created_at",
  "id, name, phone, commission_percent",
  "id, name",
] as const;

/**
 * `lead_providers` may be old (id+name only). Add columns via
 * `migrations/add_lead_revenue_bootstrap.sql` or `add_lead_providers.sql`.
 */
export async function loadLeadProviderRows(
  supabase: SupabaseClient,
  options: { organizationId: string | null }
): Promise<{ data: LeadProviderListRow[]; error: { message: string } | null }> {
  const { organizationId: oid } = options;

  const tryCols = async (cols: string) => {
    const q = supabase
      .from("lead_providers")
      .select(cols)
      .order("name", { ascending: true });
    let { data, error } =
      oid != null ? await q.eq("organization_id", oid) : await q;
    if (error && oid != null && /column|schema|organization_id/i.test(error.message)) {
      const fb = await supabase
        .from("lead_providers")
        .select(cols)
        .order("name", { ascending: true });
      data = fb.data;
      error = fb.error;
    }
    return { data, error };
  };

  let lastMessage = "";
  for (const cols of COL_CHAINS) {
    const { data, error } = await tryCols(cols);
    if (!error) {
      return {
        data: (data ?? []) as unknown as LeadProviderListRow[],
        error: null,
      };
    }
    lastMessage = error.message;
    const m = (error.message ?? "").toLowerCase();
    if (
      !/column|schema|400|select|phone|commission|created_at|does not exist|bad request/.test(
        m
      )
    ) {
      return { data: [], error: { message: error.message } };
    }
  }

  return {
    data: [],
    error: {
      message: lastMessage || "lead_providers: הרץ migrations/add_lead_revenue_bootstrap.sql",
    },
  };
}
