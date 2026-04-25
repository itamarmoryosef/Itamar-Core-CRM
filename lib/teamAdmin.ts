import type { SupabaseClient } from "@supabase/supabase-js";

/** נבדק מול טבלת `profiles` עם לקוח service-role (עוקף RLS). */
export async function isProfileTeamAdmin(
  client: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[teamAdmin] profiles lookup failed", error.message);
    return false;
  }
  return data?.role === "admin";
}
