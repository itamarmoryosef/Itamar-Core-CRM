import type { SupabaseClient } from "@supabase/supabase-js";
import { SETTING_KEY_ADMIN_NOTIFICATION_PHONE } from "@/lib/settingsKeys";

export async function getSettingValue(
  client: SupabaseClient,
  key: string
): Promise<string | null> {
  const { data, error } = await client
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return null;
  const v = (data as { value: string }).value?.trim();
  return v && v.length > 0 ? v : null;
}

export async function getAdminNotificationPhone(
  client: SupabaseClient
): Promise<string | null> {
  return getSettingValue(client, SETTING_KEY_ADMIN_NOTIFICATION_PHONE);
}

export async function upsertSettingValue(
  client: SupabaseClient,
  key: string,
  value: string
): Promise<{ error: Error | null }> {
  const { error } = await client.from("settings").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  return { error: error ? new Error(error.message) : null };
}
