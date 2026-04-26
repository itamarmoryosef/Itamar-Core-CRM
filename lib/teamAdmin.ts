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

export async function isProfilePlatformSuper(
  client: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await client
    .from("profiles")
    .select("is_platform_super")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    const m = error.message?.toLowerCase() ?? "";
    if (m.includes("is_platform_super") || m.includes("column")) {
      return false;
    }
    console.error("[platformSuper] profiles lookup failed", error.message);
    return false;
  }
  return (data as { is_platform_super?: boolean } | null)
    ?.is_platform_super === true;
}
