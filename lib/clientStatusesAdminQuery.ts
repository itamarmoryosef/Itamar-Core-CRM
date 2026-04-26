import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientStatusPickerRow = {
  id: string;
  label: string;
  color_hex: string;
  sort_order: number;
  is_system: boolean;
  /** Omitted when `client_statuses.is_active` does not exist. */
  is_active?: boolean | null;
};

const BASE_COLS = "id, label, color_hex, sort_order, is_system";

export function isMissingIsActiveColumn(message: string): boolean {
  return /is_active|column|schema/i.test(message);
}

export function sortClientStatusesByOrderAndLabel<T extends { sort_order: number; label: string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.label.localeCompare(b.label, "he");
  });
}

/**
 * All rows for admin API (list + pickers that show disabled rows if needed).
 */
export async function fetchAllClientStatuses(
  supabase: SupabaseClient
): Promise<{ data: ClientStatusPickerRow[] | null; error: { message: string } | null }> {
  const withActive = await supabase
    .from("client_statuses")
    .select(`${BASE_COLS}, is_active`)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (!withActive.error) {
    return { data: (withActive.data ?? []) as ClientStatusPickerRow[], error: null };
  }
  if (!/is_active|column|schema/i.test(withActive.error.message)) {
    return { data: null, error: { message: withActive.error.message } };
  }
  const fb = await supabase
    .from("client_statuses")
    .select(BASE_COLS)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (fb.error) {
    return { data: null, error: { message: fb.error.message } };
  }
  return { data: (fb.data ?? []) as ClientStatusPickerRow[], error: null };
}

/**
 * CRM card dropdown: prefer `is_active = true` when the column exists.
 */
export async function fetchActiveClientStatusesForCrmPickers(
  supabase: SupabaseClient
): Promise<ClientStatusPickerRow[]> {
  const filtered = await supabase
    .from("client_statuses")
    .select(`${BASE_COLS}, is_active`)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (!filtered.error) {
    return (filtered.data ?? []) as ClientStatusPickerRow[];
  }
  if (process.env.NODE_ENV === "development" && !/is_active|column|schema/i.test(filtered.error.message)) {
    console.warn("[clientStatusesAdminQuery] is_active filter:", filtered.error.message);
  }
  const all = await supabase
    .from("client_statuses")
    .select(BASE_COLS)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (all.error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[clientStatusesAdminQuery] load all failed:", all.error.message);
    }
    return [];
  }
  return (all.data ?? []) as ClientStatusPickerRow[];
}
